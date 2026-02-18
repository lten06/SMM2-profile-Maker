/**
 * Minimal "SMM2 Profile Maker" site in a single TypeScript file.
 * - No login
 * - Create profile (bio, 職人id, tags, top10)
 * - List & search
 * - View profile
 *
 * Data is stored in-memory (resets on restart).
 */

import * as http from "http";
import { URL } from "url";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

type TopCourse = {
  title: string;
  courseId: string; // e.g. ABC-123-DEF
  note?: string;
};

type Profile = {
  id: string;
  handle: string; // URL slug
  name: string;
  makerId: string;
  bio: string;
  tags: string[];
  top10: TopCourse[];
  createdAt: number;
  updatedAt: number;
  editSecret: string;
};

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// In-memory "DB"
const profiles = new Map<string, Profile>(); // key: handle

// ---- Persistence (JSON file) ----
function ensureWritableDir(preferred: string) {
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(process.cwd(), "data");
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

const DATA_DIR = ensureWritableDir(
  process.env.DATA_DIR || (process.env.RENDER ? "/var/data" : path.join(process.cwd(), "data"))
);

const DATA_FILE = path.join(DATA_DIR, "profiles.json");
// 書き込みをまとめる（連打で毎回書くと重い＆壊れやすい）
let saveTimer: NodeJS.Timeout | null = null;

function serializeProfiles(): Profile[] {
  return Array.from(profiles.values());
}

function hydrateProfiles(list: Profile[]) {
  profiles.clear();
  for (const p of list) {
    if (!p?.handle) continue;
    profiles.set(p.handle, p);
  }
}

// atomic write: 一時ファイルに書いてから置き換える（途中で落ちても壊れにくい）
function saveProfilesSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const tmp = DATA_FILE + ".tmp";
      const json = JSON.stringify(serializeProfiles(), null, 2);
      fs.writeFileSync(tmp, json, "utf8");
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) {
      console.error("Failed to save profiles:", e);
    }
  }, 150); // 0.15秒まとめ
}

function loadProfilesFromDisk() {
  try {
    if (!fs.existsSync(DATA_FILE)) return false;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return false;
    hydrateProfiles(list);
    return true;
  } catch (e) {
    console.error("Failed to load profiles:", e);
    return false;
  }
}

// 起動時にディスクから復元。無ければサンプル投入（任意）
const loaded = loadProfilesFromDisk();
if (!loaded) {
  seedExample(); // いらなければ消してOK
  saveProfilesSoon(); // 初回のサンプルも保存しておく
}

function seedExample() {
  const now = Date.now();

  const p: Profile = {
    id: crypto.randomUUID(),
    handle: "sample",
    name: "molten",
    makerId: "BH9-PJY-7VF",

    bio: "こんにちは！このサイトを運営している者です。マリオメーカー2ではmoltenという名前で活動しています。",
    tags: ["ギミック", "謎解き"],
    top10: [
      { title: "[4YMM] Mortal Koopas", courseId: "Y2T-XLV-YDF", note: "2020年に投稿されたグローバル演奏つきのボスラッシュ。投稿された当時はグローバル演奏はマリメ界隈ではあまり認知されておらず(私もこのコースで知りました)、マリオメーカーの四周年を祝うコースだったこともあり、グローバル演奏はこのコース以降急速的に増えた印象があります。演奏のクオリティも一級品でボス戦の臨場感もあったので、一位に選ばせていただきました。" },
      { title: "Threading the Needle", courseId: "N9Q-LSP-LQG", note: "カロン甲羅とスターを使った新感覚のアクションコース。縦横無尽に駆けめぐる爽快感と操作性は他のコースでは味わえません。" },
      { title: "Spring Has Switched", courseId: "J7D-9L6-THG", note: "初代であり唯一のつくる王のこなさん作のスタンダードコース。初日に投稿されたと思えないほど新ギミックを使いこなしています。デザインがかわいらしく、スタンダード作りの教科書のようなコースです。" },
      { title: "5-1 しゃくねつのピラミッド Pyro Pyramid", courseId: "2W3-MMM-GMF", note: "初代スキンの砂漠の雰囲気とアイテムの配置が絶妙で、古代遺跡の中にいるような気分を味わえます。難易度もちょうどよくシンプルで奥深いコースです。数年たった今でも深く印象に残っています。" },
      { title: "[7MMC] Wacky Wheel Waltz", courseId: "89N-F7W-7JG", note: "テレンを一風変わった方法で配置して作られたスタンダードコース。テレンが通常だとありえない配置の仕方をしているので、見ているだけでも面白いです。" },
      { title: "Zelda TotK - Colgera Boss Theme", courseId: "JNP-5FY-QLG", note: "ゼルダの伝説ティアーズオブキングダムのフリザゲイラ戦の演奏コース。オートスクロールの純粋な演奏コースですが、音源のチョイスやキラー砲台のドラムの音の使い方に感動したので、演奏コース枠として選びました。" },
    ],

    createdAt: now,
    updatedAt: now,

    editSecret: "dev-sample-secret",
  };

  profiles.set(p.handle, p);
}

const TAG_OPTIONS = [
  "演奏",
  "レール演奏",
  "TROLL",
  "研究家",
  "ギミック",
  "一画面",
  "スタンダード",
  "みんバト",
  "みんクリ",
  "スピードラン",
  "高難易度",
  "ドット絵",
  "謎解き",
  "テクニック",
  "全自動",
  "タイムアタッカー",
  "ワールド",
  "雰囲気",
] as const;

type TagOption = (typeof TAG_OPTIONS)[number];


/** ---------- Utilities ---------- */

function makeUniqueHandle(preferred: string, fallbackName: string): string {

  let base = toHandle(preferred) || toHandle(fallbackName);

  if (!base) base = "user";

  let candidate = base;
  let n = 2;
  while (profiles.has(candidate)) {
    const suffix = `-${n}`;
    candidate = (base.slice(0, 32 - suffix.length) + suffix);
    n++;
    if (n > 9999) {
      candidate = crypto.randomUUID().slice(0, 8);
      break;
    }
  }
  return candidate;
}


function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toHandle(input: string): string {
  // Allow only [a-z0-9-_], lowercased. Convert spaces to hyphen.
  const base = input.trim().toLowerCase().replace(/\s+/g, "-");
  const cleaned = base.replace(/[^a-z0-9-_]/g, "");
  return cleaned.slice(0, 32);
}

function parseSelectedTags(params: URLSearchParams): string[] {
  // form から "tags" を複数受け取る（checkbox）
  const selected = params.getAll("tags");

  // 候補だけに絞る（順番は候補順で揃えると見た目が安定）
  const allowed = new Set<string>(TAG_OPTIONS as unknown as string[]);
  const filtered: string[] = [];
  for (const t of selected) {
    if (allowed.has(t) && !filtered.includes(t)) filtered.push(t);
    if (filtered.length >= 2) break; // ★最大2つ
  }
  return filtered;
}


function normalizeMakerId(input: string): string {

  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const a = cleaned.slice(0, 3);
  const b = cleaned.slice(3, 6);
  const c = cleaned.slice(6, 9);
  const formatted = [a, b, c].filter(Boolean).join("-");
  return formatted;
}

function newEditSecret(): string {

  return crypto.randomBytes(18).toString("base64url");
}

function isValidSecret(s: string): boolean {
  return typeof s === "string" && s.length >= 16 && s.length <= 64;
}

function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const header = req.headers.cookie ?? "";
  const out: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

function setCookie(res: http.ServerResponse, name: string, value: string) {

  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
  const prev = res.getHeader("Set-Cookie");
  if (!prev) res.setHeader("Set-Cookie", cookie);
  else if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, cookie]);
  else res.setHeader("Set-Cookie", [String(prev), cookie]);
}



function isValidMakerId(input: string): boolean {
  return /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(input.trim().toUpperCase());
}


function normalizeCourseId(input: string): string {
  return input.trim().toUpperCase().slice(0, 20);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendHtml(res: http.ServerResponse, html: string, status = 200) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}

function sendJson(res: http.ServerResponse, obj: any, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj, null, 2));
}

function notFound(res: http.ServerResponse) {
  sendHtml(res, layout("404", `<p>ページが見つかりません。</p><p><a href="/">トップへ</a></p>`), 404);
}

function badRequest(res: http.ServerResponse, msg: string) {
  sendHtml(res, layout("エラー", `<p style="color:#c00;">${escapeHtml(msg)}</p><p><a href="/new">戻る</a></p>`), 400);
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)} - SMM2 Profile Maker</title>
<style>
  :root{
    /* Mario Maker-ish soft theme */
    --bg: #fff9e6;           /* warm cream */
    --bg2:#fffdf6;
    --card:#ffffff;
    --text:#1f2937;          /* slate-800 */
    --muted:#6b7280;         /* gray-500 */
    --border: rgba(0,0,0,.10);
    --shadow: 0 10px 30px rgba(0,0,0,.10);
    --accent:#ffd000;        /* maker yellow */
    --accent2:#ffb800;       /* deeper yellow */
    --link:#0b62ff;          /* playful blue link */
    --chip:#fff2b3;          /* tag bg */
    --chipBorder: rgba(0,0,0,.10);
    --radius: 18px;
  }

  /* Light theme by default (kids-friendly) */
  body{
    margin: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.65;
    color: var(--text);
    background:
      radial-gradient(1200px 600px at 10% 0%, var(--bg2) 0%, var(--bg) 55%, #ffffff 100%);
  }

  header{
    display:flex;
    gap:12px;
    align-items:center;
    justify-content:space-between;
    margin-bottom:18px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: linear-gradient(180deg, #ffffff 0%, #fff7d4 100%);
    box-shadow: 0 6px 18px rgba(0,0,0,.08);
  }

  .brand a{
    font-weight: 900;
    letter-spacing: .2px;
    color: var(--text);
    text-decoration: none;
  }

  .brand a::before{
    content:"★";
    display:inline-block;
    margin-right:8px;
    color: var(--accent2);
    filter: drop-shadow(0 2px 0 rgba(0,0,0,.08));
  }

  a{ color: var(--link); text-decoration: none; }
  a:hover{ text-decoration: underline; }

  .muted{ color: var(--muted); opacity: 1; }
  .small{ font-size: 12px; }

  .card{
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    margin: 10px 0;
    background: var(--card);
    box-shadow: 0 10px 30px rgba(0,0,0,.08);
  }

  /* はみ出し防止の基本 */
  * { box-sizing: border-box; }

  .row{
    display:flex;
    gap:12px;
    flex-wrap:wrap;
    align-items:flex-start;
  }

  /* 2カラム→狭い時は自然に縦並び */
  .row > div{
    flex: 1 1 420px;  /* 420pxを下回ると折り返しやすい */
    min-width: 0;     /* ★これがないと input がはみ出しやすい */
  }

  .taggrid{
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    margin-top:10px;
  }

  .tagcheck{
    display:inline-flex;
    align-items:center;
    gap:8px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid var(--chipBorder);
    background: var(--chip);
    cursor:pointer;
    user-select:none;
  }

  .tagcheck input{
    width: 16px;
    height: 16px;
  }

  .taghint{
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
  }


  label{
    font-weight: 800;
    display:block;
    margin: 10px 0 6px;
  }

  input, textarea{
    width:100%;
    max-width: 100%;
    min-width: 0;
    padding: 11px 12px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: #ffffff;
    color: var(--text);
    outline: none;
  }

  input:focus, textarea:focus{
    border-color: rgba(255, 208, 0, .85);
    box-shadow: 0 0 0 4px rgba(255, 208, 0, .25);
  }

  textarea{ min-height: 96px; resize: vertical; }

  button{
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid rgba(0,0,0,.12);
    background: linear-gradient(180deg, var(--accent) 0%, var(--accent2) 100%);
    color: #1b1b1b;
    cursor:pointer;
    font-weight: 900;
    box-shadow: 0 10px 20px rgba(255, 208, 0, .25);
  }
  button:hover{ filter: brightness(1.02); transform: translateY(-1px); }
  button:active{ transform: translateY(0px); }

  .tags{ display:flex; gap:8px; flex-wrap:wrap; margin-top:6px; }
  .tag{
    border: 1px solid var(--chipBorder);
    background: var(--chip);
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    color: #2f2f2f;
  }

  h1,h2,h3{ letter-spacing: .2px; }
  h2{ margin-top: 18px; }

  .top10{
    list-style: none;
    padding-left: 0;
    margin-left: 0;
  }
  .top10 li{
    margin: 8px 0;
  }
  .top10 .sub{
    margin-left: 12px;
  }

</style>

</head>
<body>
<header>
  <div class="brand"><a href="/">SMM2 Profile Maker</a></div>
  <nav class="muted">
    <a href="/new">プロフィール作成</a>
    <span> · </span>
    <a href="/makers">職人一覧</a>
    <span> · </span>
    <a href="/edit">編集</a>
  </nav>
</header>
${body}
</body>
</html>`;
}

/** ---------- Pages ---------- */

function homePage(q: string, tag: string): string {
  const list = Array.from(profiles.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((p) => {
      const text = (p.name + " " + p.handle + " " + p.bio + " " + p.tags.join(" ")).toLowerCase();
      const okQ = q ? text.includes(q.toLowerCase()) : true;
      const okTag = tag ? p.tags.includes(tag) : true;
      return okQ && okTag;
    });

  // tag cloud
  const tagCounts = new Map<string, number>();
  for (const p of profiles.values()) {
    for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const tagsSorted = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24);

  const tagButtons = tagsSorted
    .map(([t, c]) => {
      const active = tag === t;
      const href = active ? `/?q=${encodeURIComponent(q)}` : `/?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(t)}`;
      return `<a class="tag" href="${href}" title="${escapeHtml(String(c))}人">${escapeHtml(t)} (${c})</a>`;
    })
    .join("");

  const cards = list
    .map((p) => {
      const top = p.top10[0];
      return `<div class="card">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <div><strong><a href="/u/${encodeURIComponent(p.handle)}">${escapeHtml(p.name)}</a></strong> <span class="muted">@${escapeHtml(p.handle)}</span></div>
            <div class="muted small">職人ID: ${escapeHtml(p.makerId)}</div>
          </div>
          <div class="muted small">${new Date(p.updatedAt).toLocaleDateString("ja-JP")}</div>
        </div>
        <div style="margin-top:8px;">${escapeHtml(p.bio)}</div>
        <div class="tags">${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        ${
          top
            ? `<div class="muted small" style="margin-top:10px;">Top1: ${escapeHtml(top.title)} <span class="copy">(${escapeHtml(
                top.courseId
              )})</span></div>`
            : ""
        }
      </div>`;
    })
    .join("");

  const into = `<p class="muted"> プロフィールを作成して、あなたのお気に入りのコースを共有しましょう！</p>`;
  const info = `<p class="muted"> このサイトは非公式のファンサイトです。任天堂株式会社とは一切関係ありません。</p>`;

  return layout(
  "トップ",
  `

  ${into}

  <div class="card">
    <form method="GET" action="/">
      <div class="row">
        <div>
          <label>名前から職人を探す</label>
          <input name="q" value="${escapeHtml(q)}" placeholder="例: ゲストさん" />
        </div>
      </div>

      <div style="margin-top:12px;">
        <button type="submit">検索</button>
        <a class="muted" style="margin-left:10px;" href="/">リセット</a>
        ${
          tag
            ? `<span class="muted small" style="margin-left:12px;">絞り込み中: <strong>${escapeHtml(tag)}</strong> <a href="/?q=${encodeURIComponent(q)}" class="muted" style="margin-left:6px;">解除</a></span>`
            : ``
        }
      </div>
    </form>

    <hr style="opacity:.22; margin:16px 0;" />

    <div><strong>タグから職人を探す</strong> <span class="muted small">(数字は使われているタグの数)</span></div>
    <div class="tags" style="margin-top:10px;">
      ${tagButtons || `<span class="muted">まだタグがありません。</span>`}
    </div>
  </div>

  <h2 style="margin-top:18px;">職人一覧 <span class="muted small">(${list.length})</span></h2>
  ${cards || `<p class="muted">まだプロフィールがありません。<a href="/new">作成</a>してみてください。</p>`}
  ${info}
  `
  );
}

function makersPage(): string {
  const list = Array.from(profiles.values()).sort((a, b) => {
    // 新しい順
    return b.updatedAt - a.updatedAt;
  });

  const items = list
    .map((p) => {
      return `<div class="card">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <div>
              <strong><a href="/u/${encodeURIComponent(p.handle)}">${escapeHtml(p.name)}</a></strong>
              <span class="muted"> @${escapeHtml(p.handle)}</span>
            </div>
            <div class="muted small">職人ID: ${escapeHtml(p.makerId)}</div>
          </div>
          <div class="muted small">${new Date(p.updatedAt).toLocaleDateString("ja-JP")}</div>
        </div>
        <div style="margin-top:8px;">${escapeHtml(p.bio || "")}</div>
        <div class="tags" style="margin-top:10px;">
          ${p.tags.map((t) => `<a class="tag" href="/?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join("")}
        </div>
      </div>`;
    })
    .join("");

  return layout(
    "職人一覧",
    `
<h1 style="margin-top:0;">職人一覧 <span class="muted small">(${list.length})</span></h1>
<p class="muted">登録されている職人をすべて表示しています。名前をクリックするとプロフィールに移動します。</p>
${items || `<p class="muted">まだプロフィールがありません。<a href="/new">プロフィール作成</a>へ。</p>`}
`
  );
}


function newProfilePage(): string {
  return layout(
    "プロフィール作成",
    `
<div class="card">
  <p class="muted">プロフィールはいつでも編集できます。</p>
  <form method="POST" action="/new">
    <label>表示名（必須）</label>
    <input name="name" required maxlength="40" placeholder="例: マリオ / Mario" />

    <label>プロフィールURL（任意・英数字）</label>
    <input name="handle" maxlength="32" placeholder="例: mario（空なら自動生成）" />
    <div class="small muted">空なら表示名から自動生成します（英数字以外は自動で削除）</div>

    <label>職人ID（必須）</label>
    <input
      id="makerIdInput"
      name="makerId"
      required
      maxlength="11"
      placeholder="例: ABC-123-DEF"
      inputmode="text"
      autocomplete="off"
      autocapitalize="characters"
      style="text-transform: uppercase;"
      pattern="[A-Za-z0-9]{3}-[A-Za-z0-9]{3}-[A-Za-z0-9]{3}"
      title="例: ABC-123-DEF（英大文字/数字 3-3-3）"
    />
    <div class="small muted">小文字OK。入力中に自動で ABC-123-DEF の形に整形します</div>

    <label>自己紹介（任意）</label>
    <textarea name="bio" maxlength="300" placeholder="例: スタンダードコースを中心に制作しています。演奏コースが好きです。"></textarea>

    <label>職人タグ（あなたのアートスタイルを設定しましょう）</label>
    <div class="taggrid">
      ${TAG_OPTIONS.map(t => `
        <label class="tagcheck">
          <input type="checkbox" name="tags" value="${escapeHtml(t)}" />
          <span>${escapeHtml(t)}</span>
        </label>
      `).join("")}
    </div>
    <div class="taghint">※ 最大2つまで選べます</div>

    <script>
      (function () {
        const boxes = Array.from(document.querySelectorAll('input[name="tags"]'));
        function enforce(){
          const checked = boxes.filter(b => b.checked);
          if (checked.length >= 2){
            boxes.forEach(b => { if (!b.checked) b.disabled = true; });
          }else{
            boxes.forEach(b => { b.disabled = false; });
          }
        }
        boxes.forEach(b => b.addEventListener("change", enforce));
        enforce();
      })();
    </script>

    <hr style="opacity:.3; margin:16px 0;" />
    <div><strong>お気に入りのコース</strong> <span class="muted small">（10コースまで登録できます / 空でもOK）</span></div>

    ${Array.from({ length: 10 })
      .map((_, i) => {
        const n = i + 1;
        return `
        <div class="card" style="margin-top:10px;">
          <div class="muted small">#${n}</div>
          <label>コース名</label>
          <input name="c_title_${n}" maxlength="60" placeholder="例: Snow Night Walk" />
          <label>コースID</label>
          <input name="c_id_${n}" maxlength="20" placeholder="例: ABC-123-DEF" />
          <label>ひとこと（任意）</label>
          <input name="c_note_${n}" maxlength="80" placeholder="例: 雪BGMと一本道。落ち着く雰囲気。" />
        </div>`;
      })
      .join("")}

    <div style="margin-top:14px;">
      <button type="submit">作成する</button>
    </div>

    <script>
      (function () {
        const el = document.getElementById("makerIdInput");
        if (!el) return;

        function formatMakerId(raw) {
          const cleaned = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9);
          const a = cleaned.slice(0, 3);
          const b = cleaned.slice(3, 6);
          const c = cleaned.slice(6, 9);
          return [a, b, c].filter(Boolean).join("-");
        }

        el.addEventListener("input", () => {
          const before = el.value;
          const after = formatMakerId(before);
          if (before !== after) el.value = after;
        });

        el.addEventListener("blur", () => {
          el.value = formatMakerId(el.value);
        });
      })();
    </script>

  </form>
</div>
`
  );
}


function profilePage(handle: string): string {
  const p = profiles.get(handle);
  if (!p) return layout("見つかりません", `<p>プロフィールが見つかりません。<a href="/">トップへ</a></p>`);

  const top10 = p.top10
    .sort((a, b) => (a.title && !b.title ? -1 : 0))
    .map((c, idx) => {
      const rank = idx + 1;
      return `<li>
        <strong>#${rank} ${escapeHtml(c.title || "(未入力)")}</strong><br/>
        <div class="sub">
          <div class="copy">ID: ${escapeHtml(c.courseId || "-")}</div>
          ${c.note ? `<div class="muted small">${escapeHtml(c.note)}</div>` : ""}
        </div>
      </li>`;
    })
    .join("");

  return layout(
    p.name,
    `
<div class="card">
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
    <div>
      <h1 style="margin:0;">${escapeHtml(p.name)}</h1>
      <div class="muted">@${escapeHtml(p.handle)}</div>
      <div class="muted small" style="margin-top:4px;">職人ID: <span class="copy">${escapeHtml(p.makerId)}</span></div>
    </div>
    <div class="muted small">更新: ${new Date(p.updatedAt).toLocaleString("ja-JP")}</div>
  </div>

  <p>${p.bio ? escapeHtml(p.bio) : `<span class="muted">なし</span>`}</p>

  <h3>職人タグ</h3>
  <div class="tags">
    ${p.tags.length ? p.tags.map((t) => `<a class="tag" href="/?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join("") : `<span class="muted">なし</span>`}
  </div>

  <h3 style="margin-top:16px;">${escapeHtml(p.name)}のお気に入りのコース</h3>
  ${
    p.top10.some((c) => c.title || c.courseId)
      ? `<ol class="top10">${top10}</ol>`
      : `<p class="muted">お気に入りのコースは未登録です。</p>`
  }

  <hr style="opacity:.3; margin:16px 0;" />
  <p class="muted small">このURLをそのまま貼って名刺として使えます： <span class="copy">/u/${escapeHtml(p.handle)}</span></p>
</div>

<p><a href="/">← 一覧へ戻る</a></p>
`
  );
}

/** ---------- Server ---------- */

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method ?? "GET";
    const u = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const pathname = u.pathname;

    // Basic routing
    if (method === "GET" && pathname === "/") {
      const q = u.searchParams.get("q") ?? "";
      const tag = u.searchParams.get("tag") ?? "";
      return sendHtml(res, homePage(q, tag));
    }

    if (method === "GET" && pathname === "/makers") {
      return sendHtml(res, makersPage());
    }

    if (method === "GET" && pathname === "/new") {
      const cookies = parseCookies(req);
      const myHandle = cookies["mm_handle"];
      const mySecret = cookies["mm_secret"];

      if (myHandle && mySecret) {
        const p = profiles.get(myHandle);
        if (p && p.editSecret === mySecret) {
          return sendHtml(
            res,
            layout(
              "作成済み",
              `<div class="card">
                <h1 style="margin-top:0;">あなたは既にプロフィールを作成しています</h1>
                <p class="muted">新規作成ではなく、編集してください。</p>
                <p><a href="/u/${encodeURIComponent(myHandle)}">自分のプロフィールを見る</a></p>
                <p><a href="/edit">編集ページへ</a></p>
              </div>`
            )
          );
        }
      }

      return sendHtml(res, newProfilePage());
    }

    if (method === "POST" && pathname === "/new") {
      // ★ 1人1プロフィール（この端末）チェック
      const cookies = parseCookies(req);
      const myHandle = cookies["mm_handle"];
      const mySecret = cookies["mm_secret"];
      if (myHandle && mySecret) {
        const existing = profiles.get(myHandle);
        if (existing && existing.editSecret === mySecret) {
          // すでに作ってるなら新規作成させない（編集へ誘導）
          res.writeHead(303, { Location: "/edit" });
          return res.end();
          // もしくは badRequest(res, "すでにプロフィールを作成しています。編集してください。");
        }
      }

      const body = await readBody(req);
      const params = new URLSearchParams(body);

      const name = (params.get("name") ?? "").trim();
      const handleRaw = (params.get("handle") ?? "").trim();

      const makerIdRaw = (params.get("makerId") ?? "").trim();
      const makerId = normalizeMakerId(makerIdRaw); // ★ 小文字→大文字＆整形

      const bio = (params.get("bio") ?? "").trim();
      const tags = parseSelectedTags(params);

      if (!name) return badRequest(res, "表示名が必要です。");
      const handle = makeUniqueHandle(handleRaw, name);
      if (!makerId) return badRequest(res, "職人IDが必要です。");
      if (!isValidMakerId(makerId)) {
        return badRequest(res, "職人IDの形式が正しくありません。例: ABC-123-DEF");
      }

      // Build Top10
      const top10: TopCourse[] = [];
      for (let i = 1; i <= 10; i++) {
        const title = (params.get(`c_title_${i}`) ?? "").trim();
        const courseId = normalizeCourseId(params.get(`c_id_${i}`) ?? "");
        const note = (params.get(`c_note_${i}`) ?? "").trim();

        if (title || courseId || note) {
          top10.push({
            title: title.slice(0, 60),
            courseId: courseId.slice(0, 20),
            note: note ? note.slice(0, 80) : undefined,
          });
        }
      }

      const now = Date.now();

      // ★ 本人確認用 secret を発行
      const editSecret = newEditSecret();

      const p: Profile = {
        id: crypto.randomUUID(),
        handle,
        name: name.slice(0, 40),
        makerId: makerId.slice(0, 20),
        bio: bio.slice(0, 300),
        tags,
        top10,
        createdAt: now,
        updatedAt: now,

        editSecret, // ★ 追加
      };

      profiles.set(handle, p);
      saveProfilesSoon();

      // ★ この端末の「本人」として cookie 保存
      setCookie(res, "mm_handle", handle);
      setCookie(res, "mm_secret", editSecret);

      res.writeHead(303, { Location: `/u/${encodeURIComponent(handle)}` });
      return res.end();
    }


    if (method === "GET" && pathname.startsWith("/u/")) {
      const handle = decodeURIComponent(pathname.slice("/u/".length));
      return sendHtml(res, profilePage(handle));
    }

    if (method === "GET" && pathname === "/edit") {
      const cookies = parseCookies(req);
      const myHandle = cookies["mm_handle"];
      const mySecret = cookies["mm_secret"];

      if (!myHandle || !mySecret) {
        return sendHtml(res, layout("編集できません", `<div class="card"><p>編集キーが見つかりません（この端末で作成していない可能性があります）。</p><p><a href="/new">新規作成</a></p></div>`), 403);
      }

      const p = profiles.get(myHandle);
      if (!p || p.editSecret !== mySecret) {
        return sendHtml(res, layout("編集できません", `<div class="card"><p>プロフィールがありません。</p></div>`), 403);
      }

      return sendHtml(res, editProfilePage(p));
    }

    if (method === "POST" && pathname === "/edit") {
      const cookies = parseCookies(req);
      const myHandle = cookies["mm_handle"];
      const mySecret = cookies["mm_secret"];

      if (!myHandle || !mySecret) {
        return sendHtml(res, layout("編集できません", `<p>権限がありません。</p>`), 403);
      }

      const p = profiles.get(myHandle);
      if (!p || p.editSecret !== mySecret) {
        return sendHtml(res, layout("編集できません", `<p>権限がありません。</p>`), 403);
      }

      const body = await readBody(req);
      const params = new URLSearchParams(body);

      const name = (params.get("name") ?? "").trim();

      const makerIdRaw = (params.get("makerId") ?? "").trim();
      const makerId = normalizeMakerId(makerIdRaw);

      // ★ これが必須（あなたの貼ったコードに無い）
      const bio = (params.get("bio") ?? "").trim();
      const tags = parseSelectedTags(params);

      if (!name) return badRequest(res, "表示名が必要です。");
      if (!makerId) return badRequest(res, "職人IDが必要です。");
      if (!isValidMakerId(makerId)) {
        return badRequest(res, "職人IDの形式が正しくありません。例: ABC-123-DEF");
      }

      const top10: TopCourse[] = [];
      for (let i = 1; i <= 10; i++) {
        const title = (params.get(`c_title_${i}`) ?? "").trim();
        const courseId = normalizeCourseId(params.get(`c_id_${i}`) ?? "");
        const note = (params.get(`c_note_${i}`) ?? "").trim();
        if (title || courseId || note) top10.push({ title, courseId, note: note || undefined });
      }

      p.name = name.slice(0, 40);
      p.makerId = makerId.slice(0, 20);
      p.bio = bio.slice(0, 300);
      p.tags = tags;
      p.top10 = top10;
      p.updatedAt = Date.now();
      saveProfilesSoon();

      res.writeHead(303, { Location: `/u/${encodeURIComponent(p.handle)}` });
      return res.end();
    }


    return notFound(res);
  } catch (err: any) {
    return sendHtml(
      res,
      layout("サーバエラー", `<p style="color:#c00;">${escapeHtml(String(err?.message ?? err))}</p><p><a href="/">トップへ</a></p>`),
      500
    );
  }
});

function editProfilePage(p: Profile): string {
  return layout(
    "プロフィール編集",
    `
<div class="card">
  <h1 style="margin-top:0;">プロフィール編集</h1>
  <p class="muted">自分のプロフィールだけ編集できます。</p>

  <form method="POST" action="/edit">
    <label>表示名</label>
    <input name="name" required maxlength="40" value="${escapeHtml(p.name)}" />

    <label>ID</label>
    <input name="makerId" required maxlength="20" value="${escapeHtml(p.makerId)}" />

    <label>自己紹介（任意）</label>
    <textarea name="bio" maxlength="300">${escapeHtml(p.bio)}</textarea>

    <label>タグ（最大2つ）</label>
    <div class="taggrid">
      ${TAG_OPTIONS.map(t => {
        const checked = p.tags.includes(t) ? "checked" : "";
        return `
          <label class="tagcheck">
            <input type="checkbox" name="tags" value="${escapeHtml(t)}" ${checked}/>
            <span>${escapeHtml(t)}</span>
          </label>
        `;
      }).join("")}
    </div>
    <div class="taghint">※ 最大2つまで選べます</div>

    <script>
      (function () {
        const boxes = Array.from(document.querySelectorAll('input[name="tags"]'));
        function enforce(){
          const checked = boxes.filter(b => b.checked);
          if (checked.length >= 2){
            boxes.forEach(b => { if (!b.checked) b.disabled = true; });
          }else{
            boxes.forEach(b => { b.disabled = false; });
          }
        }
        boxes.forEach(b => b.addEventListener("change", enforce));
        enforce();
      })();
    </script>

    <hr style="opacity:.3; margin:16px 0;" />
    <div><strong>${escapeHtml(p.name)}のお気に入りのコース</strong></div>

    ${Array.from({ length: 10 }).map((_, i) => {
      const n = i + 1;
      const c = p.top10[i] ?? { title:"", courseId:"", note:"" };
      return `
      <div class="card" style="margin-top:10px;">
        <div class="muted small">#${n}</div>
        <label>コース名</label>
        <input name="c_title_${n}" maxlength="60" value="${escapeHtml(c.title ?? "")}" />
        <label>コースID</label>
        <input name="c_id_${n}" maxlength="20" value="${escapeHtml(c.courseId ?? "")}" />
        <label>ひとこと</label>
        <input name="c_note_${n}" maxlength="80" value="${escapeHtml(c.note ?? "")}" />
      </div>`;
    }).join("")}

    <div style="margin-top:14px;">
      <button type="submit">更新する</button>
      <a class="muted" style="margin-left:10px;" href="/u/${encodeURIComponent(p.handle)}">キャンセル</a>
    </div>
  </form>
</div>
`
  );
}

server.listen(PORT, () => {
  console.log(`SMM2 Profile Maker running: http://localhost:${PORT}`);
});
