import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
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

function yen(value) {
  if (value === null || value === undefined) return '不明';
  return `¥${Number(value).toLocaleString('ja-JP')}`;
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
          <h2 class="title">${escapeHtml(item.title)}</h2>
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
        <a class="source" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source_name ?? '一次情報')}</a>
      </div>
    </article>`;
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

console.log(`Built ${files.length} assets in dist/ with prerendered ranking pages.`);
