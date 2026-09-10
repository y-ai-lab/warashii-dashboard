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

function officialLinks(item) {
  const urls = item.official_sources ?? [];
  if (!urls.length) return '';
  return `<div class="card-footer">${urls.map((url, i) => `<a class="source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">公式${i + 1}</a>`).join('')}</div>`;
}

function unresolvedList(item) {
  const values = item.unresolved ?? [];
  if (!values.length) return '';
  return `<details><summary>未解決条件</summary><ul class="conditions">${values.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
}

function renderPendingCard(item) {
  return `<article class="card">
    <div class="card-top"><div><div class="badges"><span class="badge rec" data-rec="STOP">未検証</span><span class="badge category">${esc(trustLabel(item.trust))}</span><span class="badge freshness">強度 ${esc(item.signal_strength)}/5</span></div><h2 class="title">${esc(item.title)}</h2><p class="provider">${esc(item.source_name)}</p></div></div>
    <div class="reward">REVIEW_REQUIRED / NOT_SCORED</div>
    <dl class="facts"><div><dt>発見日</dt><dd>${esc(item.discovered_at)}</dd></div><div><dt>最終検出</dt><dd>${esc(item.last_seen_at)}</dd></div><div><dt>実行可否</dt><dd>禁止（未検証）</dd></div></dl>
    <p class="conversion">発見理由：${esc(item.reason)}</p>
    <p class="notes">公式情報・0円条件・地域/KYC・Hard Gate・100点評価の確認が終わるまで実行しません。</p>
    <div class="card-footer"><a class="source" href="${esc(item.candidate_url)}" target="_blank" rel="noopener noreferrer">候補シグナルを見る</a></div>
  </article>`;
}

function renderReviewedCard(item) {
  return `<article class="card">
    <div class="card-top"><div><div class="badges"><span class="badge rec" data-rec="WATCH">WATCH</span><span class="badge category">公式確認済み候補</span><span class="badge freshness">${esc(item.reviewed_at)}</span></div><h2 class="title">${esc(item.title)}</h2><p class="provider">Discovery review</p></div><div class="score"><strong>${esc(item.score ?? '-')}</strong><span>/100</span></div></div>
    <div class="reward">${esc(item.reward_label ?? '価値未確定')}</div>
    <dl class="facts"><div><dt>必要資金</dt><dd>${Number(item.required_funds_yen ?? 0) === 0 ? '¥0' : `¥${esc(item.required_funds_yen)}`}</dd></div><div><dt>Risk</dt><dd>${esc(item.risk_label)}</dd></div><div><dt>スマホ</dt><dd>${esc(item.mobile)}</dd></div><div><dt>Radar昇格</dt><dd>${item.promotion_ready ? '可能' : '保留'}</dd></div></dl>
    <p class="conversion">変換ルート：${esc(item.conversion_route)}</p>
    <p class="notes">${esc(item.review_note)}</p>
    ${unresolvedList(item)}
    ${officialLinks(item)}
  </article>`;
}

function renderPage(queue, summary) {
  const all = queue.candidates ?? [];
  const pending = all.filter(x => x.status === 'REVIEW_REQUIRED');
  const reviewed = all.filter(x => x.status === 'REVIEWED_WATCH');
  const pendingCards = pending.length ? pending.map(renderPendingCard).join('\n') : '<p class="empty">現在、未検証のレビュー待ち候補はありません。</p>';
  const reviewedCards = reviewed.length ? reviewed.map(renderReviewedCard).join('\n') : '<p class="empty">現在、レビュー済みWATCH候補はありません。</p>';
  const checked = summary.generated_at ?? queue.generated_at ?? '未実行';
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="わらしべ Asset RadarのOpportunity Discovery。自動発見した未検証候補と、公式確認後もRadar昇格を保留しているWATCH候補を分離して公開。" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${BASE_URL}/discovery/" />
  <link rel="alternate" type="application/rss+xml" title="わらしべ Asset Radar 更新フィード" href="${BASE_URL}/feed.xml" />
  <meta property="og:type" content="website" /><meta property="og:locale" content="ja_JP" /><meta property="og:site_name" content="わらしべ Asset Radar" /><meta property="og:title" content="Opportunity Discovery｜わらしべ Asset Radar" /><meta property="og:description" content="未検証候補とレビュー済みWATCHを隔離して管理。" /><meta property="og:url" content="${BASE_URL}/discovery/" />
  <meta name="twitter:card" content="summary" />
  <title>Opportunity Discovery｜わらしべ Asset Radar</title>
  <link rel="stylesheet" href="../styles.css" />
</head>
<body>
  <header class="site-header"><div class="shell header-inner"><div><p class="eyebrow">OPPORTUNITY DISCOVERY</p><h1>候補発見・レビューキュー</h1><p class="subtitle">発見と採用を分離し、誤検知や未確定案件をRadar本体へ混ぜない。</p></div><a class="header-badge" href="../">Radarへ戻る</a></div></header>
  <main class="shell">
    <nav class="asset-nav" aria-label="サイト内ナビゲーション"><a href="../">全案件</a><a href="../rankings/zero-yen.html">0円ランキング</a><a href="../categories/">カテゴリ</a><a href="../methodology/">評価方法</a><a href="../updates/">更新履歴</a></nav>
    <section class="score-guide" style="border-width:2px"><h2>⚠ 発見シグナル ≠ 推薦</h2><p><b>REVIEW_REQUIRED は実行禁止。</b> REVIEWED_WATCHも不確定条件が残るため、Radar本体への昇格または実行推奨とは別扱いです。</p></section>
    <section class="ranking-hero"><p class="eyebrow">DISCOVERY STATUS</p><h2>候補発見エンジン</h2><p>プラットフォームやGitHubは発見シグナルとしてのみ使い、最終判断はプロジェクト自身の公式情報へ戻します。</p><div class="ranking-meta"><span>未検証 <b>${pending.length}</b></span><span>レビュー済WATCH <b>${reviewed.length}</b></span><span>今回新規 <b>${esc(summary.new_count ?? 0)}</b></span><span>ノイズ除外 <b>${esc(summary.noise_pruned ?? 0)}</b></span><span>エラー <b>${esc(summary.error_count ?? 0)}</b></span><span>最終探索 <b>${esc(checked)}</b></span></div></section>
    <section class="score-guide"><h2>未検証候補</h2><p>ここは実行禁止の隔離領域です。</p></section><section class="cards">${pendingCards}</section>
    <section class="score-guide"><h2>レビュー済みWATCH</h2><p>公式情報まで確認したものの、価値・地域条件・受領条件などが未確定でRadar昇格を保留している候補です。</p></section><section class="cards">${reviewedCards}</section>
    <section class="score-guide"><h2>Radar採用までのゲート</h2><ol class="conditions"><li>プロジェクト自身の公式サイト / Docs / 公式SNSを特定</li><li>0円で始められるか、0円で続けられるかを分離して確認</li><li>地域・KYC・資金・規約とHard Gateを確認</li><li>100点評価を実施してGO / WATCH / STOPを決定</li><li>GO/WATCHに値し、実行判断に必要な条件が十分確認できたものだけRadar本体へ追加</li></ol></section>
  </main>
  <footer class="shell footer"><p>Discoveryは候補探索の情報資産です。未確定情報をRadar本体から隔離すること自体を品質管理資産として扱います。</p></footer>
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

console.log(`Generated public discovery queue: pending=${pending?.length ?? 0}`);
