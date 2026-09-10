import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const BASE_URL = 'https://y-ai-lab.github.io/warashii-dashboard';
const FEED_URL = `${BASE_URL}/feed.xml`;

const SCORE_MAX = {
  initial_cost: 20,
  expected_value: 20,
  risk: 15,
  time_efficiency: 15,
  reproducibility: 10,
  compoundability: 10,
  automation: 5,
  mobile: 5,
};

const CATEGORY_SLUGS = {
  'ポイント・金融': 'finance-points',
  '少額投資・キャンペーン': 'small-investment',
  'DePIN・Web3': 'web3-depin',
  'Airdrop・Testnet': 'airdrop-testnet',
  '無料デジタル資産': 'digital-assets',
  'デジタル資産': 'owned-digital-assets',
};

const LEGACY_CATEGORY_ALIASES = {
  'Airdrop・Testnet': ['category-8836d3096a'],
};

function scoreOf(item) {
  return Object.entries(SCORE_MAX).reduce((sum, [key, max]) => {
    const value = Number(item.score_components?.[key] ?? 0);
    return sum + Math.min(Math.max(value, 0), max);
  }, 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function categorySlug(category) {
  if (CATEGORY_SLUGS[category]) return CATEGORY_SLUGS[category];
  const hash = createHash('sha1').update(category).digest('hex').slice(0, 10);
  return `category-${hash}`;
}

function opportunityPath(item) {
  return `../opportunities/${encodeURIComponent(item.id)}.html`;
}

function yen(value) {
  if (value === null || value === undefined) return '不明';
  return `¥${Number(value).toLocaleString('ja-JP')}`;
}

function rssDate(dateString) {
  const value = dateString || new Date().toISOString().slice(0, 10);
  return new Date(`${value}T00:00:00+09:00`).toUTCString();
}

function renderCategoryCard(item) {
  return `<article class="card">
    <div class="card-top">
      <div>
        <div class="badges">
          <span class="badge rec" data-rec="${escapeHtml(item.recommendation)}">${escapeHtml(item.recommendation)}</span>
          <span class="badge category">${escapeHtml(item.asset_type)}</span>
        </div>
        <h2 class="title"><a href="${opportunityPath(item)}">${escapeHtml(item.title)}</a></h2>
        <p class="provider">${escapeHtml(item.provider)}</p>
      </div>
      <div class="score"><strong>${scoreOf(item)}</strong><span>/100</span></div>
    </div>
    <div class="reward">${escapeHtml(item.reward_label)}</div>
    <dl class="facts">
      <div><dt>必要資金</dt><dd>${yen(item.required_funds_yen)}</dd></div>
      <div><dt>作業時間</dt><dd>${escapeHtml(item.work_time_label)}</dd></div>
      <div><dt>最終確認</dt><dd>${escapeHtml(item.verified_at ?? '未確認')}</dd></div>
    </dl>
    <p class="conversion">変換ルート：${escapeHtml(item.conversion_route)}</p>
    <div class="card-footer">
      <a class="source" href="${opportunityPath(item)}">詳細を見る</a>
      <a class="source" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">一次情報</a>
    </div>
  </article>`;
}

function renderCategoryPage(category, items, updatedAt) {
  const slug = categorySlug(category);
  const canonical = `${BASE_URL}/categories/${slug}.html`;
  const sorted = [...items].sort((a, b) => scoreOf(b) - scoreOf(a));
  const goCount = sorted.filter(item => item.recommendation === 'GO').length;
  const zeroCount = sorted.filter(item => Number(item.required_funds_yen ?? 0) === 0).length;
  const cards = sorted.map(renderCategoryCard).join('\n');
  const description = `${category}の案件を、0円資産構築の100点評価で比較。${sorted.length}件掲載、GO ${goCount}件、0円 ${zeroCount}件。`;
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" type="application/rss+xml" title="わらしべ Asset Radar 更新フィード" href="${FEED_URL}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ja_JP" />
  <meta property="og:site_name" content="わらしべ Asset Radar" />
  <meta property="og:title" content="${escapeHtml(category)}｜わらしべ Asset Radar" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta name="twitter:card" content="summary" />
  <title>${escapeHtml(category)}｜わらしべ Asset Radar</title>
  <link rel="stylesheet" href="../styles.css" />
</head>
<body>
  <header class="site-header"><div class="shell header-inner"><div><p class="eyebrow">カテゴリ別Radar</p><h1>${escapeHtml(category)}</h1><p class="subtitle">同じ資産タイプを横並びで比較する。</p></div><a class="header-badge" href="../">Radarへ戻る</a></div></header>
  <main class="shell">
    <nav class="asset-nav" aria-label="サイト内ナビゲーション"><a href="../">全案件</a><a href="../rankings/zero-yen.html">0円ランキング</a><a href="../rankings/top-score.html">高Score</a><a href="./">カテゴリ一覧</a></nav>
    <section class="ranking-hero"><p class="eyebrow">CATEGORY</p><h2>${escapeHtml(category)}の比較</h2><p>${escapeHtml(description)}</p><div class="ranking-meta"><span>掲載 <b>${sorted.length}</b></span><span>GO <b>${goCount}</b></span><span>0円 <b>${zeroCount}</b></span><span>DB更新 <b>${escapeHtml(updatedAt)}</b></span></div></section>
    <section class="cards">${cards}</section>
  </main>
  <footer class="shell footer"><p>報酬・条件・期限は変動します。実行直前に一次情報を再確認してください。</p></footer>
</body>
</html>`;
}

function renderCategoryIndex(categories, grouped, updatedAt) {
  const canonical = `${BASE_URL}/categories/`;
  const tiles = categories.map(category => {
    const items = grouped.get(category) ?? [];
    const goCount = items.filter(item => item.recommendation === 'GO').length;
    const zeroCount = items.filter(item => Number(item.required_funds_yen ?? 0) === 0).length;
    return `<article class="card"><div class="badges"><span class="badge category">${items.length}件</span><span class="badge rec" data-rec="GO">GO ${goCount}</span></div><h2 class="title"><a href="${categorySlug(category)}.html">${escapeHtml(category)}</a></h2><p class="notes">0円案件 ${zeroCount}件。カテゴリ内をScore順で比較します。</p></article>`;
  }).join('\n');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="わらしべ Asset Radarのカテゴリ一覧。金融・Web3・DePIN・デジタル資産などをカテゴリ別に比較。" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" type="application/rss+xml" title="わらしべ Asset Radar 更新フィード" href="${FEED_URL}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ja_JP" />
  <meta property="og:site_name" content="わらしべ Asset Radar" />
  <meta property="og:title" content="カテゴリ一覧｜わらしべ Asset Radar" />
  <meta property="og:description" content="金融・Web3・DePIN・デジタル資産などをカテゴリ別に比較。" />
  <meta property="og:url" content="${canonical}" />
  <title>カテゴリ一覧｜わらしべ Asset Radar</title>
  <link rel="stylesheet" href="../styles.css" />
</head>
<body>
  <header class="site-header"><div class="shell header-inner"><div><p class="eyebrow">カテゴリ別Radar</p><h1>カテゴリ一覧</h1><p class="subtitle">資産の種類ごとに、0円から取れる価値を比較する。</p></div><a class="header-badge" href="../">Radarへ戻る</a></div></header>
  <main class="shell">
    <nav class="asset-nav" aria-label="サイト内ナビゲーション"><a href="../">全案件</a><a href="../rankings/zero-yen.html">0円ランキング</a><a href="../rankings/top-score.html">高Score</a><a href="./" aria-current="page">カテゴリ一覧</a></nav>
    <section class="ranking-hero"><p class="eyebrow">CATEGORIES</p><h2>${categories.length}カテゴリを比較</h2><p>同種の案件を横並びにし、Score・必要資金・GO/WATCHを見比べられます。</p><div class="ranking-meta"><span>DB更新 <b>${escapeHtml(updatedAt)}</b></span><span>RSS <b><a href="../feed.xml">購読</a></b></span></div></section>
    <section class="cards">${tiles}</section>
  </main>
  <footer class="shell footer"><p>カテゴリページは案件DBからビルド時に自動生成されます。</p></footer>
</body>
</html>`;
}

function renderLegacyRedirect(category) {
  const canonical = `${BASE_URL}/categories/${categorySlug(category)}.html`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8" /><meta name="robots" content="noindex,follow" /><link rel="canonical" href="${canonical}" /><meta http-equiv="refresh" content="0; url=${canonical}" /><title>移動しました｜わらしべ Asset Radar</title></head><body><p><a href="${canonical}">${escapeHtml(category)}の新しいページへ移動</a></p></body></html>`;
}

function renderFeed(items, updatedAt) {
  const sorted = [...items].sort((a, b) => String(b.verified_at ?? '').localeCompare(String(a.verified_at ?? '')) || scoreOf(b) - scoreOf(a));
  const entries = sorted.map(item => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(`${BASE_URL}/opportunities/${encodeURIComponent(item.id)}.html`)}</link>
      <guid isPermaLink="true">${escapeXml(`${BASE_URL}/opportunities/${encodeURIComponent(item.id)}.html`)}</guid>
      <pubDate>${rssDate(item.verified_at)}</pubDate>
      <category>${escapeXml(item.category)}</category>
      <description>${escapeXml(`${item.recommendation} / Score ${scoreOf(item)}/100 / ${item.reward_label} / 必要資金 ${yen(item.required_funds_yen)} / 最終確認 ${item.verified_at ?? '未確認'}`)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>わらしべ Asset Radar 更新フィード</title>
    <link>${BASE_URL}/</link>
    <description>0円から取得できる資産・権利・ポイント・デジタル資産の更新フィード</description>
    <language>ja</language>
    <lastBuildDate>${rssDate(updatedAt)}</lastBuildDate>
    <ttl>1440</ttl>
${entries}
  </channel>
</rss>\n`;
}

async function injectIntoHtml(path, categoryLinksHtml = '') {
  let html = await readFile(path, 'utf8');
  if (!html.includes('application/rss+xml')) {
    html = html.replace('</head>', `  <link rel="alternate" type="application/rss+xml" title="わらしべ Asset Radar 更新フィード" href="${FEED_URL}" />\n</head>`);
  }
  if (categoryLinksHtml && !html.includes('data-generated="category-links"')) {
    const marker = '</nav>';
    const index = html.indexOf(marker);
    if (index !== -1) {
      html = `${html.slice(0, index + marker.length)}\n${categoryLinksHtml}${html.slice(index + marker.length)}`;
    }
  }
  await writeFile(path, html, 'utf8');
}

const payload = JSON.parse(await readFile(resolve(root, 'data', 'opportunities.json'), 'utf8'));
const opportunities = payload.opportunities ?? [];
const updatedAt = payload.updated_at ?? new Date().toISOString().slice(0, 10);
const grouped = new Map();
for (const item of opportunities) {
  const list = grouped.get(item.category) ?? [];
  list.push(item);
  grouped.set(item.category, list);
}
const categories = [...grouped.keys()].sort((a, b) => a.localeCompare(b, 'ja'));

const categoriesDir = resolve(output, 'categories');
await mkdir(categoriesDir, { recursive: true });
await writeFile(resolve(categoriesDir, 'index.html'), renderCategoryIndex(categories, grouped, updatedAt), 'utf8');
for (const category of categories) {
  await writeFile(resolve(categoriesDir, `${categorySlug(category)}.html`), renderCategoryPage(category, grouped.get(category) ?? [], updatedAt), 'utf8');
  for (const legacySlug of LEGACY_CATEGORY_ALIASES[category] ?? []) {
    await writeFile(resolve(categoriesDir, `${legacySlug}.html`), renderLegacyRedirect(category), 'utf8');
  }
}
await writeFile(resolve(output, 'feed.xml'), renderFeed(opportunities, updatedAt), 'utf8');

const categoryLinksHtml = `<nav class="asset-nav" data-generated="category-links" aria-label="カテゴリ別ページ"><a href="categories/">カテゴリ一覧</a>${categories.map(category => `<a href="categories/${categorySlug(category)}.html">${escapeHtml(category)}</a>`).join('')}</nav>`;
await injectIntoHtml(resolve(output, 'index.html'), categoryLinksHtml);

for (const page of ['zero-yen.html', 'top-score.html', 'review.html']) {
  await injectIntoHtml(resolve(output, 'rankings', page));
}
for (const item of opportunities) {
  await injectIntoHtml(resolve(output, 'opportunities', `${encodeURIComponent(item.id)}.html`));
}

let sitemap = await readFile(resolve(output, 'sitemap.xml'), 'utf8');
const sitemapEntries = [
  [`${BASE_URL}/categories/`, '0.8'],
  ...categories.map(category => [`${BASE_URL}/categories/${categorySlug(category)}.html`, '0.7']),
].map(([url, priority]) => `  <url>\n    <loc>${escapeXml(url)}</loc>\n    <lastmod>${escapeXml(updatedAt)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join('\n');
sitemap = sitemap.replace('</urlset>', `${sitemapEntries}\n</urlset>`);
await writeFile(resolve(output, 'sitemap.xml'), sitemap, 'utf8');

console.log(`Augmented build with ${categories.length} category pages, category hub and RSS feed.`);
