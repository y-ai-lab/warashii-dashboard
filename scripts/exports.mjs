import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const output = resolve(dist, 'exports');
const BASE_URL = 'https://y-ai-lab.github.io/warashii-dashboard';
const payload = JSON.parse(await readFile(resolve(root, 'data', 'opportunities.json'), 'utf8'));
const items = payload.opportunities ?? [];

function scoreOf(item) {
  const max = { initial_cost:20, expected_value:20, risk:15, time_efficiency:15, reproducibility:10, compoundability:10, automation:5, mobile:5 };
  return Object.entries(max).reduce((sum, [key, limit]) => sum + Math.min(Math.max(Number(item.score_components?.[key] ?? 0), 0), limit), 0);
}

function record(item) {
  return {
    id: item.id,
    title: item.title,
    provider: item.provider,
    category: item.category,
    asset_type: item.asset_type,
    recommendation: item.recommendation,
    score: scoreOf(item),
    required_funds_yen: item.required_funds_yen,
    potential_value_yen: item.potential_value_yen,
    reward_label: item.reward_label,
    work_minutes: item.work_minutes,
    work_time_label: item.work_time_label,
    acquisition_days_label: item.acquisition_days_label,
    risk_label: item.risk_label,
    mobile: item.mobile,
    deadline_label: item.deadline_label,
    conversion_route: item.conversion_route,
    verified_at: item.verified_at,
    source_url: item.source_url,
    source_name: item.source_name,
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const records = items.map(record);
const meta = {
  schema_version: '1.0',
  updated_at: payload.updated_at ?? null,
  generated_from: 'data/opportunities.json',
  count: records.length,
  note: '条件・報酬は変動します。実行前にsource_urlの一次情報を再確認してください。',
};

await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'opportunities.json'), JSON.stringify({ meta, opportunities: records }, null, 2) + '\n', 'utf8');
await writeFile(resolve(output, 'go.json'), JSON.stringify({ meta: { ...meta, filter: 'GO' }, opportunities: records.filter(x => x.recommendation === 'GO') }, null, 2) + '\n', 'utf8');
await writeFile(resolve(output, 'zero-yen.json'), JSON.stringify({ meta: { ...meta, filter: 'required_funds_yen=0' }, opportunities: records.filter(x => Number(x.required_funds_yen) === 0) }, null, 2) + '\n', 'utf8');

const columns = Object.keys(records[0] ?? {});
const csv = [columns.join(','), ...records.map(row => columns.map(key => csvEscape(row[key])).join(','))].join('\n') + '\n';
await writeFile(resolve(output, 'opportunities.csv'), csv, 'utf8');

const index = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="description" content="わらしべ Asset Radarの案件データをJSON/CSVで再利用できます。" /><meta name="robots" content="index,follow" /><link rel="canonical" href="${BASE_URL}/exports/" /><title>データ出力｜わらしべ Asset Radar</title><link rel="stylesheet" href="../styles.css" /></head>
<body><header class="site-header"><div class="shell header-inner"><div><p class="eyebrow">REUSABLE DATA</p><h1>データ出力</h1><p class="subtitle">Radarの案件データを、次のBot・分析・サイトへ再利用する。</p></div><a class="header-badge" href="../">Radarへ戻る</a></div></header><main class="shell"><nav class="asset-nav"><a href="../">全案件</a><a href="../methodology/">評価方法</a><a href="../updates/">更新履歴</a></nav><section class="ranking-hero"><p class="eyebrow">EXPORTS</p><h2>${records.length}件を機械可読形式で公開</h2><p>元データと同じ更新日に自動生成されます。条件は変動するため、実行前は各レコードのsource_urlを確認してください。</p><div class="ranking-meta"><span>Schema <b>1.0</b></span><span>DB更新 <b>${payload.updated_at ?? '不明'}</b></span></div></section><section class="cards"><article class="card"><h2 class="title"><a href="opportunities.json">全案件 JSON</a></h2><p class="notes">全レコードをScore付きで取得。</p></article><article class="card"><h2 class="title"><a href="opportunities.csv">全案件 CSV</a></h2><p class="notes">表計算・分析向け。</p></article><article class="card"><h2 class="title"><a href="go.json">GO案件 JSON</a></h2><p class="notes">現時点の実行候補だけ。</p></article><article class="card"><h2 class="title"><a href="zero-yen.json">0円案件 JSON</a></h2><p class="notes">必要資金0円の候補だけ。</p></article></section></main><footer class="shell footer"><p>公開データは比較・再利用用。報酬保証や投資助言ではありません。</p></footer></body></html>`;
await writeFile(resolve(output, 'index.html'), index, 'utf8');

const sitemapPath = resolve(dist, 'sitemap.xml');
let sitemap = await readFile(sitemapPath, 'utf8');
const url = `${BASE_URL}/exports/`;
if (!sitemap.includes(`<loc>${url}</loc>`)) {
  const lastmod = payload.updated_at ?? new Date().toISOString().slice(0, 10);
  sitemap = sitemap.replace('</urlset>', `  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>\n  </url>\n</urlset>`);
  await writeFile(sitemapPath, sitemap, 'utf8');
}

console.log(`Generated reusable exports: ${records.length} records.`);
