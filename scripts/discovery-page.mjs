import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const BASE_URL = 'https://y-ai-lab.github.io/warashii-dashboard';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function trustLabel(value) {
  if (value === 'platform_signal') return 'Platform signal';
  if (value === 'community_signal') return 'Community signal';
  return value || 'Unknown signal';
}

function renderCard(item) {
  return `<article class="card">
    <div class="card-top">
      <div>
        <div class="badges">
          <span class="badge rec" data-rec="STOP">未検証</span>
          <span class="badge category">${esc(trustLabel(item.trust))}</span>
          <span class="badge freshness">強度 ${esc(item.signal_strength)}/5</span>
        </div>
        <h2 class="title">${esc(item.title)}</h2>
        <p class="provider">${esc(item.source_name)}</p>
      </div>
    </div>
    <div class="reward">REVIEW_REQUIRED / NOT_SCORED</div>
    <dl class="facts">
      <div><dt>発見日</dt><dd>${esc(item.discovered_at)}</dd></div>
      <div><dt>最終検出</dt><dd>${esc(item.last_seen_at)}</dd></div>
      <div><dt>Signal</dt><dd>${esc(item.signal_type)}</dd></div>
      <div><dt>実行可否</dt><dd>禁止（未検証）</dd></div>
    </dl>
    <p class="conversion">発見理由：${esc(item.reason)}</p>
    <p class="notes">公式サイト・公式Docs・地域/KYC/資金条件・Hard Gate・100点評価の確認が終わるまでRadar本体には入りません。</p>
    <div class="card-footer"><a class="source" href="${esc(item.candidate_url)}" target="_blank" rel="noopener noreferrer">候補シグナルを見る</a></div>
  </article>`;
}

function renderPage(queue, summary) {
  const candidates = (queue.candidates ?? []).filter(x => x.status === 'REVIEW_REQUIRED');
  const cards = candidates.length ? candidates.map(renderCard).join('\n') : '<p class="empty">現在、レビュー待ち候補はありません。</p>';
  const checked = summary.generated_at ?? queue.generated_at ?? '未実行';
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="わらしべ Asset Radarが自動発見した未検証候補のレビューキュー。候補は実行推奨ではなく、公式確認と100点評価が終わるまで実行禁止です。" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${BASE_URL}/discovery/" />
  <link rel="alternate" type="application/rss+xml" title="わらしべ Asset Radar 更新フィード" href="${BASE_URL}/feed.xml" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ja_JP" />
  <meta property="og:site_name" content="わらしべ Asset Radar" />
  <meta property="og:title" content="Opportunity Discovery｜わらしべ Asset Radar" />
  <meta property="og:description" content="自動発見した未検証候補を、採用前のレビューキューとして公開。" />
  <meta property="og:url" content="${BASE_URL}/discovery/" />
  <meta name="twitter:card" content="summary" />
  <title>Opportunity Discovery｜わらしべ Asset Radar</title>
  <link rel="stylesheet" href="../styles.css" />
</head>
<body>
  <header class="site-header"><div class="shell header-inner"><div><p class="eyebrow">OPPORTUNITY DISCOVERY</p><h1>未検証候補キュー</h1><p class="subtitle">新しい機会を自動発見し、採用前に人間確認を挟む。</p></div><a class="header-badge" href="../">Radarへ戻る</a></div></header>
  <main class="shell">
    <nav class="asset-nav" aria-label="サイト内ナビゲーション"><a href="../">全案件</a><a href="../rankings/zero-yen.html">0円ランキング</a><a href="../categories/">カテゴリ</a><a href="../methodology/">評価方法</a><a href="../updates/">更新履歴</a></nav>
    <section class="score-guide" style="border-width:2px"><h2>⚠ 未検証 / 実行禁止</h2><p><b>REVIEW_REQUIRED は推薦ではありません。</b> 発見シグナルに過ぎず、プロジェクト自身の公式情報、0円条件、地域/KYC、Hard Gate、100点評価を確認するまで実行しません。</p></section>
    <section class="ranking-hero"><p class="eyebrow">DISCOVERY STATUS</p><h2>候補発見エンジン</h2><p>Galxe / Zealy等は発見シグナル、GitHubはコミュニティシグナルとしてのみ使用します。最終判断の根拠にはしません。</p><div class="ranking-meta"><span>レビュー待ち <b>${candidates.length}</b></span><span>今回新規 <b>${esc(summary.new_count ?? 0)}</b></span><span>ノイズ除外 <b>${esc(summary.noise_pruned ?? 0)}</b></span><span>取得エラー <b>${esc(summary.error_count ?? 0)}</b></span><span>最終探索 <b>${esc(checked)}</b></span></div></section>
    <section class="cards">${cards}</section>
    <section class="score-guide"><h2>Radar採用までのゲート</h2><ol class="conditions"><li>プロジェクト自身の公式サイト / Docs / 公式SNSを特定</li><li>0円で始められるか、0円で続けられるかを分離して確認</li><li>地域・KYC・資金・規約とHard Gateを確認</li><li>100点評価を実施してGO / WATCH / STOPを決定</li><li>GO/WATCHに値するものだけRadar本体へ追加</li></ol></section>
  </main>
  <footer class="shell footer"><p>Discovery Queueは未検証情報の隔離領域です。ここにあるだけでは資産・報酬・権利の獲得可能性を保証しません。</p></footer>
</body>
</html>`;
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

function discoveryLinkFor(file) {
  const rel = relative(output, file).replaceAll('\\', '/');
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  return `<nav class="asset-nav" data-generated="discovery-link" aria-label="新規案件候補"><a href="${prefix}discovery/">候補発見</a></nav>`;
}

const queue = JSON.parse(await readFile(resolve(root, 'data', 'discovery_queue.json'), 'utf8'));
const summary = JSON.parse(await readFile(resolve(root, 'data', 'discovery', 'summary.json'), 'utf8'));

await mkdir(resolve(output, 'discovery'), { recursive: true });
await writeFile(resolve(output, 'discovery', 'index.html'), renderPage(queue, summary), 'utf8');

for (const file of await htmlFiles(output)) {
  if (file.includes('/discovery/')) continue;
  let html = await readFile(file, 'utf8');
  if (html.includes('data-generated="discovery-link"')) continue;
  const mainIndex = html.indexOf('<main');
  const navEnd = html.indexOf('</nav>', mainIndex);
  if (mainIndex !== -1 && navEnd !== -1) {
    html = `${html.slice(0, navEnd + 6)}\n${discoveryLinkFor(file)}${html.slice(navEnd + 6)}`;
    await writeFile(file, html, 'utf8');
  }
}

const sitemapPath = resolve(output, 'sitemap.xml');
let sitemap = await readFile(sitemapPath, 'utf8');
const url = `${BASE_URL}/discovery/`;
if (!sitemap.includes(`<loc>${url}</loc>`)) {
  const lastmod = (queue.generated_at ?? new Date().toISOString()).slice(0, 10);
  const entry = `  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
  sitemap = sitemap.replace('</urlset>', `${entry}</urlset>`);
  await writeFile(sitemapPath, sitemap, 'utf8');
}

console.log(`Generated public discovery queue: ${queue.candidates?.length ?? 0} candidates.`);
