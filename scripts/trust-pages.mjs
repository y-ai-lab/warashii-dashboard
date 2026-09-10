import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const BASE_URL = 'https://y-ai-lab.github.io/warashii-dashboard';

const SCORE_ITEMS = [
  ['初期費用', 20, '0円で始められるほど高評価。'],
  ['期待値', 20, '得られる価値と成功確率を合わせて評価。'],
  ['リスク', 15, '元本損失・個人情報・規約・詐欺などのリスクが低いほど高評価。'],
  ['時間効率', 15, '必要作業時間に対する期待リターンを評価。'],
  ['再現性', 10, '一度きりでなく、繰り返し使える仕組みほど高評価。'],
  ['複利性', 10, '得た資産を次の資産獲得へ再利用しやすいほど高評価。'],
  ['自動化可能性', 5, '監視・更新・配信などを自動化しやすいほど高評価。'],
  ['スマホ完結度', 5, 'スマートフォンだけで完結しやすいほど高評価。'],
];

const MILESTONES = [
  ['v0.1', '公開MVP', '案件DB・100点評価・検索/フィルターを公開。'],
  ['v0.2', '自動監視', '一次情報の低頻度監視と差分検知をGitHub Actions化。'],
  ['v0.4', '検索入口', '0円・高Score・要再確認ランキングを静的HTML化。'],
  ['v0.5', '個別ページ/IndexNow', '案件別URL・sitemap・IndexNow自動通知を追加。'],
  ['v0.6', 'カテゴリ/RSS/透明性', 'カテゴリ別ページ・RSS・評価方法・更新履歴を追加。'],
];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pageShell({ title, eyebrow, subtitle, canonical, body }) {
  const description = `${title}。${subtitle}`;
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" type="application/rss+xml" title="わらしべ Asset Radar 更新フィード" href="${BASE_URL}/feed.xml" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ja_JP" />
  <meta property="og:site_name" content="わらしべ Asset Radar" />
  <meta property="og:title" content="${esc(title)}｜わらしべ Asset Radar" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta name="twitter:card" content="summary" />
  <title>${esc(title)}｜わらしべ Asset Radar</title>
  <link rel="stylesheet" href="../styles.css" />
</head>
<body>
  <header class="site-header"><div class="shell header-inner"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div><a class="header-badge" href="../">Radarへ戻る</a></div></header>
  <main class="shell">
    <nav class="asset-nav" aria-label="サイト内ナビゲーション"><a href="../">全案件</a><a href="../rankings/zero-yen.html">0円ランキング</a><a href="../categories/">カテゴリ</a><a href="../methodology/">評価方法</a><a href="../updates/">更新履歴</a></nav>
    ${body}
  </main>
  <footer class="shell footer"><p>わらしべ Asset Radar — 0円から取れる価値を、一次情報・期待値・リスクで比較する公開情報資産。</p></footer>
</body>
</html>`;
}

function methodologyPage(updatedAt) {
  const scoreCards = SCORE_ITEMS.map(([name, max, text]) => `<article class="card"><div class="card-top"><h2 class="title">${esc(name)}</h2><div class="score"><strong>${max}</strong><span>点</span></div></div><p class="notes">${esc(text)}</p></article>`).join('\n');
  return pageShell({
    title: '評価方法・運営方針',
    eyebrow: 'METHODOLOGY',
    subtitle: '0円案件をどう比較し、どこで人間確認を挟むかを公開します。',
    canonical: `${BASE_URL}/methodology/`,
    body: `
    <section class="ranking-hero"><p class="eyebrow">100 POINT SCORE</p><h2>面白さではなく、資産が増える期待値で比較</h2><p>全候補を100点満点で比較します。初期段階では「損失0円で確実性が高い小さな価値」を優先し、無料で大きな上振れがある案件はWATCHとして追跡します。</p><div class="ranking-meta"><span>DB更新 <b>${esc(updatedAt)}</b></span><span>合計 <b>100点</b></span></div></section>
    <section class="cards">${scoreCards}</section>
    <section class="score-guide"><h2>GO / WATCH / STOP</h2><p><b>GO</b> は現時点の実行候補、<b>WATCH</b> は価値・条件・リスクを継続確認する候補、<b>STOP</b> は現時点で非推奨です。Scoreだけで自動判定せず、重要な条件とHard Gateを優先します。</p></section>
    <section class="score-guide"><h2>Hard Gate</h2><p>違法行為、詐欺、虚偽申告、他人名義、禁止された複数アカウント、KYC/地域制限の回避、不正アクセス、借金・リボ・高レバレッジなどはScoreに関係なく対象外です。</p></section>
    <section class="score-guide"><h2>情報鮮度</h2><p>キャンペーン・Web3・金融・ポイント・無料サービスは条件が変わるため、実行推奨前に最新情報を確認します。優先順位は公式サイト → 公式SNS → 公式ドキュメント → 信頼できる最新メディア → コミュニティ情報です。最終確認から14日超は「要再確認」と表示します。</p></section>
    <section class="score-guide"><h2>自動監視の安全設計</h2><p>自動監視は一次情報の本文やHTTP状態の変化を検知するだけで、案件条件を自動で書き換えません。差分が出た場合は人間が一次情報を再確認してからDBを更新します。robots.txtで自動取得が許可されないページは巡回しません。</p></section>
    <section class="score-guide"><h2>資産への変換</h2><p>Radarでは現金だけでなく、ポイント・暗号資産・権利・Webサイト・コード・データベース・検索流入なども資産候補として扱います。「取得 → 保有 → 次の資産獲得へ再利用」という変換ルートを各案件に持たせます。</p></section>`,
  });
}

function extractRobotSkips(report) {
  const section = report.split('## Skipped by robots.txt')[1]?.split('## Policy')[0] ?? '';
  return section.split('\n').map(line => line.trim()).filter(line => line.startsWith('- **')).map(line => line.replace(/^- \*\*/, '').replace(/\*\* —.*/, ''));
}

function updatesPage(payload, monitor, report) {
  const items = payload.opportunities ?? [];
  const go = items.filter(x => x.recommendation === 'GO').length;
  const watch = items.filter(x => x.recommendation === 'WATCH').length;
  const skips = extractRobotSkips(report);
  const milestones = MILESTONES.slice().reverse().map(([version, name, detail]) => `<article class="card"><div class="badges"><span class="badge category">${esc(version)}</span></div><h2 class="title">${esc(name)}</h2><p class="notes">${esc(detail)}</p></article>`).join('\n');
  const skipList = skips.length ? `<ul class="conditions">${skips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>なし</p>';
  return pageShell({
    title: '更新履歴・稼働状況',
    eyebrow: 'CHANGELOG & STATUS',
    subtitle: 'Radarの更新と自動監視が本当に動いているかを公開します。',
    canonical: `${BASE_URL}/updates/`,
    body: `
    <section class="ranking-hero"><p class="eyebrow">CURRENT STATUS</p><h2>現在のRadar</h2><p>案件DBと一次情報監視の最新状態です。変更候補が出ても、自動で条件を書き換えず再確認を挟みます。</p><div class="ranking-meta"><span>掲載 <b>${items.length}</b></span><span>GO <b>${go}</b></span><span>WATCH <b>${watch}</b></span><span>DB更新 <b>${esc(payload.updated_at ?? '不明')}</b></span></div></section>
    <section class="kpis"><article class="kpi"><span>監視ソース</span><strong>${esc(monitor.source_count ?? '-')}</strong></article><article class="kpi"><span>変更候補</span><strong>${esc(monitor.change_count ?? '-')}</strong></article><article class="kpi"><span>取得エラー</span><strong>${esc(monitor.error_count ?? '-')}</strong></article><article class="kpi"><span>初期化済み</span><strong>${esc(monitor.initialized ?? '-')}</strong></article></section>
    <section class="score-guide"><h2>最終監視</h2><p>${esc(monitor.generated_at ?? '未実行')}</p></section>
    <section class="score-guide"><h2>robots.txtにより自動巡回しないソース</h2>${skipList}<p>これらは自動監視の対象外ですが、案件を推奨・更新する前に手動で一次情報を確認します。</p></section>
    <section class="score-guide"><h2>機能更新履歴</h2><p>2026-09-10に0円から構築したRadarの主要マイルストーンです。</p></section>
    <section class="cards">${milestones}</section>`,
  });
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(path));
    else if (extname(entry.name) === '.html') out.push(path);
  }
  return out;
}

function trustLinksFor(file) {
  const rel = relative(output, file).replaceAll('\\', '/');
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  return `<nav class="asset-nav" data-generated="trust-links" aria-label="運営情報"><a href="${prefix}methodology/">評価方法</a><a href="${prefix}updates/">更新履歴</a><a href="${prefix}feed.xml">RSS</a></nav>`;
}

const payload = JSON.parse(await readFile(resolve(root, 'data', 'opportunities.json'), 'utf8'));
const monitor = JSON.parse(await readFile(resolve(root, 'data', 'monitoring', 'summary.json'), 'utf8'));
const report = await readFile(resolve(root, 'data', 'monitoring', 'latest_report.md'), 'utf8');

await mkdir(resolve(output, 'methodology'), { recursive: true });
await mkdir(resolve(output, 'updates'), { recursive: true });
await writeFile(resolve(output, 'methodology', 'index.html'), methodologyPage(payload.updated_at ?? '不明'), 'utf8');
await writeFile(resolve(output, 'updates', 'index.html'), updatesPage(payload, monitor, report), 'utf8');

for (const file of await htmlFiles(output)) {
  if (file.includes('/methodology/') || file.includes('/updates/')) continue;
  let html = await readFile(file, 'utf8');
  if (html.includes('data-generated="trust-links"')) continue;
  const mainIndex = html.indexOf('<main');
  const navEnd = html.indexOf('</nav>', mainIndex);
  if (mainIndex !== -1 && navEnd !== -1) {
    html = `${html.slice(0, navEnd + 6)}\n${trustLinksFor(file)}${html.slice(navEnd + 6)}`;
    await writeFile(file, html, 'utf8');
  }
}

const sitemapPath = resolve(output, 'sitemap.xml');
let sitemap = await readFile(sitemapPath, 'utf8');
const lastmod = payload.updated_at ?? new Date().toISOString().slice(0, 10);
for (const [url, priority] of [[`${BASE_URL}/methodology/`, '0.8'], [`${BASE_URL}/updates/`, '0.7']]) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) {
    const entry = `  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
    sitemap = sitemap.replace('</urlset>', `${entry}</urlset>`);
  }
}
await writeFile(sitemapPath, sitemap, 'utf8');

console.log(`Generated methodology and updates pages; monitor sources=${monitor.source_count ?? 0}, changes=${monitor.change_count ?? 0}.`);
