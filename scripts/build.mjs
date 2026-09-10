import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const BASE_URL = 'https://y-ai-lab.github.io/warashii-dashboard';
const files = [
  'index.html',
  'styles.css',
  'app.js',
  'rankings.js',
  'rankings',
  'robots.txt',
  'sitemap.xml',
  'data',
];

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

const SCORE_LABELS = {
  initial_cost: '初期費用',
  expected_value: '期待値',
  risk: 'リスク',
  time_efficiency: '時間効率',
  reproducibility: '再現性',
  compoundability: '複利性',
  automation: '自動化',
  mobile: 'スマホ完結',
};

function scoreOf(item) {
  return Object.entries(SCORE_MAX).reduce((sum, [key, max]) => {
    const value = Number(item.score_components?.[key] ?? 0);
    return sum + Math.min(Math.max(value, 0), max);
  }, 0);
}

function recommendationWeight(value) {
  return ({ GO: 3, WATCH: 2, STOP: 1 })[value] ?? 0;
}

function daysSince(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(`${dateString}T00:00:00Z`);
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

function isStale(item) {
  return daysSince(item.verified_at) > 14;
}

function reviewPriority(item) {
  let priority = 0;
  if (isStale(item)) priority += 100;
  if (item.recommendation === 'WATCH') priority += 40;
  if (item.recommendation === 'STOP') priority += 20;
  if (/掲載終了|終了|Active|要確認|変動/.test(String(item.deadline_label ?? ''))) priority += 15;
  return priority;
}

function selectItems(items, mode) {
  if (mode === 'zero') {
    return items
      .filter(item => Number(item.required_funds_yen ?? 0) === 0)
      .sort((a, b) =>
        recommendationWeight(b.recommendation) - recommendationWeight(a.recommendation) ||
        scoreOf(b) - scoreOf(a)
      );
  }
  if (mode === 'top') {
    return [...items].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 10);
  }
  if (mode === 'review') {
    return items
      .filter(item =>
        isStale(item) ||
        item.recommendation !== 'GO' ||
        /掲載終了|終了|Active|要確認|変動/.test(String(item.deadline_label ?? ''))
      )
      .sort((a, b) => reviewPriority(b) - reviewPriority(a) || scoreOf(b) - scoreOf(a));
  }
  return items;
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
  return escapeHtml(value).replaceAll('&#039;', '&apos;');
}

function yen(value) {
  if (value === null || value === undefined) return '不明';
  return `¥${Number(value).toLocaleString('ja-JP')}`;
}

function opportunityPath(item) {
  return `opportunities/${encodeURIComponent(item.id)}.html`;
}

function opportunityUrl(item) {
  return `${BASE_URL}/${opportunityPath(item)}`;
}

function renderStaticCard(item, index) {
  const freshness = isStale(item) ? '要再確認' : '確認済み';
  return `
    <article class="card" data-prerendered="true">
      <div class="card-top">
        <div>
          <div class="badges">
            <span class="badge category">#${index + 1}</span>
            <span class="badge rec" data-rec="${escapeHtml(item.recommendation)}">${escapeHtml(item.recommendation)}</span>
            <span class="badge category">${escapeHtml(item.category)}</span>
            <span class="badge freshness${isStale(item) ? ' stale' : ''}">${freshness}</span>
          </div>
          <h2 class="title"><a href="../${opportunityPath(item)}">${escapeHtml(item.title)}</a></h2>
          <p class="provider">${escapeHtml(item.provider)} ・ ${escapeHtml(item.asset_type)}</p>
        </div>
        <div class="score"><strong>${scoreOf(item)}</strong><span>/100</span></div>
      </div>
      <div class="reward">${escapeHtml(item.reward_label)}</div>
      <dl class="facts">
        <div><dt>必要資金</dt><dd>${yen(item.required_funds_yen)}</dd></div>
        <div><dt>作業時間</dt><dd>${escapeHtml(item.work_time_label)}</dd></div>
        <div><dt>獲得まで</dt><dd>${escapeHtml(item.acquisition_days_label)}</dd></div>
        <div><dt>Risk</dt><dd>${escapeHtml(item.risk_label)}</dd></div>
        <div><dt>スマホ</dt><dd>${escapeHtml(item.mobile)}</dd></div>
        <div><dt>期限</dt><dd>${escapeHtml(item.deadline_label ?? '未定/随時')}</dd></div>
      </dl>
      <p class="conversion">変換ルート：${escapeHtml(item.conversion_route)}</p>
      <div class="card-footer">
        <span class="verified">最終確認：${escapeHtml(item.verified_at ?? '未確認')}</span>
        <span><a class="source" href="../${opportunityPath(item)}">詳細</a> ・ <a class="source" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source_name ?? '一次情報')}</a></span>
      </div>
    </article>`;
}

function renderDetailPage(item) {
  const score = scoreOf(item);
  const freshness = isStale(item) ? '要再確認' : '確認済み';
  const description = `${item.title}を、必要資金・報酬・条件・リスク・作業時間・変換ルートで評価。Score ${score}/100、最終確認 ${item.verified_at ?? '未確認'}。`;
  const conditions = (item.conditions ?? []).map(condition => `<li>${escapeHtml(condition)}</li>`).join('\n');
  const breakdown = Object.entries(SCORE_MAX)
    .map(([key, max]) => `<span>${escapeHtml(SCORE_LABELS[key])} ${escapeHtml(item.score_components?.[key] ?? 0)}/${max}</span>`)
    .join('');
  const canonical = opportunityUrl(item);
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="article" />
  <meta property="og:locale" content="ja_JP" />
  <meta property="og:site_name" content="わらしべ Asset Radar" />
  <meta property="og:title" content="${escapeHtml(item.title)}｜わらしべ Asset Radar" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta name="twitter:card" content="summary" />
  <title>${escapeHtml(item.title)}｜わらしべ Asset Radar</title>
  <link rel="stylesheet" href="../styles.css" />
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${item.title}｜わらしべ Asset Radar`,
    url: canonical,
    description,
    inLanguage: 'ja',
    dateModified: item.verified_at ?? undefined,
    isPartOf: { '@type': 'WebSite', name: 'わらしべ Asset Radar', url: `${BASE_URL}/` },
  }).replaceAll('<', '\\u003c')}</script>
</head>
<body>
  <header class="site-header">
    <div class="shell header-inner">
      <div>
        <p class="eyebrow">案件詳細</p>
        <h1>${escapeHtml(item.title)}</h1>
        <p class="subtitle">必要資金・期待値・条件・リスクを1ページで確認</p>
      </div>
      <a class="header-badge" href="../">Radarへ戻る</a>
    </div>
  </header>
  <main class="shell">
    <nav class="site-nav" aria-label="サイト内ナビゲーション">
      <a href="../">全案件</a>
      <a href="../rankings/zero-yen.html">0円ランキング</a>
      <a href="../rankings/top-score.html">高Score</a>
      <a href="../rankings/review.html">期限・要再確認</a>
    </nav>

    <section class="principle">
      <strong>${escapeHtml(item.recommendation)}</strong>
      <span>${escapeHtml(item.category)}</span>
      <span>${escapeHtml(item.asset_type)}</span>
      <span>${escapeHtml(freshness)}</span>
    </section>

    <article class="card">
      <div class="card-top">
        <div>
          <p class="provider">${escapeHtml(item.provider)}</p>
          <h2 class="title">評価サマリー</h2>
        </div>
        <div class="score"><strong>${score}</strong><span>/100</span></div>
      </div>
      <div class="reward">${escapeHtml(item.reward_label)}</div>
      <dl class="facts">
        <div><dt>必要資金</dt><dd>${yen(item.required_funds_yen)}</dd></div>
        <div><dt>作業時間</dt><dd>${escapeHtml(item.work_time_label)}</dd></div>
        <div><dt>獲得まで</dt><dd>${escapeHtml(item.acquisition_days_label)}</dd></div>
        <div><dt>Risk</dt><dd>${escapeHtml(item.risk_label)}</dd></div>
        <div><dt>スマホ</dt><dd>${escapeHtml(item.mobile)}</dd></div>
        <div><dt>期限</dt><dd>${escapeHtml(item.deadline_label ?? '未定/随時')}</dd></div>
      </dl>
      <p class="conversion">変換ルート：${escapeHtml(item.conversion_route)}</p>

      <section class="score-guide">
        <h2>条件</h2>
        <ul class="conditions">${conditions}</ul>
      </section>

      <section class="score-guide">
        <h2>100点評価の内訳</h2>
        <div class="score-grid">${breakdown}</div>
      </section>

      <section class="score-guide">
        <h2>補足</h2>
        <p>${escapeHtml(item.notes ?? '補足なし')}</p>
      </section>

      <div class="card-footer">
        <span class="verified">最終確認：${escapeHtml(item.verified_at ?? '未確認')}</span>
        <a class="source" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source_name ?? '一次情報')}を確認</a>
      </div>
    </article>

    <section class="score-guide">
      <h2>実行前の確認</h2>
      <p>報酬・対象条件・期限は変更される場合があります。実行直前に必ず一次情報を確認してください。RadarのScoreは比較補助であり、報酬や投資成果を保証するものではありません。</p>
    </section>
  </main>
  <footer class="shell footer"><p>わらしべ Asset Radar — 0円から取得できる価値を資産へ変換するための公開比較データ。</p></footer>
</body>
</html>`;
}

function renderSitemap(opportunities, lastmod) {
  const staticUrls = [
    [`${BASE_URL}/`, '1.0'],
    [`${BASE_URL}/rankings/zero-yen.html`, '0.9'],
    [`${BASE_URL}/rankings/top-score.html`, '0.8'],
    [`${BASE_URL}/rankings/review.html`, '0.8'],
  ];
  const detailUrls = opportunities.map(item => [opportunityUrl(item), '0.7']);
  const entries = [...staticUrls, ...detailUrls]
    .map(([url, priority]) => `  <url>\n    <loc>${escapeXml(url)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });

for (const file of files) {
  await cp(resolve(root, file), resolve(output, file), { recursive: true });
}

const html = await readFile(resolve(output, 'index.html'), 'utf8');
if (!html.includes('styles.css') || !html.includes('app.js')) {
  throw new Error('Built index.html does not reference the application assets.');
}

const payload = JSON.parse(await readFile(resolve(root, 'data', 'opportunities.json'), 'utf8'));
const opportunities = payload.opportunities ?? [];
const pages = [
  ['zero-yen.html', 'zero'],
  ['top-score.html', 'top'],
  ['review.html', 'review'],
];

for (const [page, mode] of pages) {
  const pagePath = resolve(output, 'rankings', page);
  let pageHtml = await readFile(pagePath, 'utf8');
  if (!pageHtml.includes('../rankings.js') || !pageHtml.includes('../styles.css')) {
    throw new Error(`Built rankings/${page} is missing shared assets.`);
  }
  const selected = selectItems(opportunities, mode);
  const cards = selected.map(renderStaticCard).join('\n');
  pageHtml = pageHtml.replace(
    '<section id="rankingCards" class="cards" aria-live="polite"></section>',
    `<section id="rankingCards" class="cards" aria-live="polite">${cards}\n    </section>`
  );
  pageHtml = pageHtml.replace('id="rankingCount">-</b>', `id="rankingCount">${selected.length}</b>`);
  pageHtml = pageHtml.replace('id="rankingChecked">-</b>', `id="rankingChecked">${escapeHtml(payload.updated_at ?? '不明')}</b>`);
  await writeFile(pagePath, pageHtml, 'utf8');
}

const opportunitiesDir = resolve(output, 'opportunities');
await mkdir(opportunitiesDir, { recursive: true });
for (const item of opportunities) {
  await writeFile(resolve(opportunitiesDir, `${encodeURIComponent(item.id)}.html`), renderDetailPage(item), 'utf8');
}

await writeFile(
  resolve(output, 'sitemap.xml'),
  renderSitemap(opportunities, payload.updated_at ?? new Date().toISOString().slice(0, 10)),
  'utf8'
);

console.log(`Built ${files.length} assets, ${pages.length} ranking pages and ${opportunities.length} opportunity detail pages.`);
