import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist', 'exports');
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

console.log(`Generated reusable exports: ${records.length} records.`);
