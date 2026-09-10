import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const BASE = 'https://y-ai-lab.github.io/warashii-dashboard';
const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function linkFor(pilot) {
  if (pilot.linked_type === 'radar') {
    return `../opportunities/${encodeURIComponent(pilot.linked_id)}.html`;
  }
  return '../discovery/';
}

function statusLabel(pilot) {
  if (pilot.result_status === 'COMPLETED') return '実測完了';
  if (pilot.status === 'RUNNING') return '実測中';
  return '開始待ち';
}

function card(pilot) {
  const metrics = (pilot.secondary_metrics ?? []).map(x => `<li>${esc(x)}</li>`).join('');
  const earned = pilot.earned_amount === null || pilot.earned_amount === undefined ? '未計測' : esc(pilot.earned_amount);
  const minutes = pilot.active_minutes === null || pilot.active_minutes === undefined ? '未計測' : `${esc(pilot.active_minutes)}分`;
  return `<article class="card">
    <div class="card-top">
      <div>
        <div class="badges">
          <span class="badge rec" data-rec="WATCH">PILOT</span>
          <span class="badge category">${esc(statusLabel(pilot))}</span>
          <span class="badge freshness">${esc(pilot.duration_days)}日</span>
        </div>
        <h2 class="title">${esc(pilot.title)}</h2>
        <p class="provider">0円実測 / ${esc(pilot.mobile === 'yes' ? 'スマホ完結' : pilot.mobile)}</p>
      </div>
    </div>
    <div class="reward">主指標：${esc(pilot.primary_metric)}</div>
    <dl class="facts">
      <div><dt>必要資金</dt><dd>¥${Number(pilot.required_funds_yen ?? 0).toLocaleString('ja-JP')}</dd></div>
      <div><dt>初期設定</dt><dd>約${esc(pilot.setup_minutes_estimate)}分</dd></div>
      <div><dt>開始</dt><dd>${esc(pilot.start_at ?? '未開始')}</dd></div>
      <div><dt>終了</dt><dd>${esc(pilot.end_at ?? '未定')}</dd></div>
      <div><dt>獲得量</dt><dd>${earned}</dd></div>
      <div><dt>実作業</dt><dd>${minutes}</dd></div>
    </dl>
    <p class="conversion">基準条件：${esc(pilot.baseline_mode)}</p>
    <details><summary>測定項目</summary><ul class="conditions">${metrics}</ul></details>
    <p class="notes">${esc(pilot.notes)}</p>
    <div class="card-footer"><a class="source" href="${esc(linkFor(pilot))}">元候補を確認</a></div>
  </article>`;
}

function render(payload) {
  const pilots = payload.pilots ?? [];
  const ready = pilots.filter(p => p.status === 'READY').length;
  const running = pilots.filter(p => p.status === 'RUNNING').length;
  const completed = pilots.filter(p => p.result_status === 'COMPLETED').length;
  const policy = payload.policy ?? {};
  return `<!doctype html><html lang="ja"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="わらしべ Asset Radarの0円実測Pilot。DePIN・Web3候補を7日間、課金や紹介なしで測定し、実効期待値を独自データ化します。">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <link rel="canonical" href="${BASE}/pilots/">
    <meta property="og:type" content="website"><meta property="og:locale" content="ja_JP"><meta property="og:site_name" content="わらしべ Asset Radar">
    <meta property="og:title" content="0円実測Pilot｜わらしべ Asset Radar"><meta property="og:description" content="候補を7日間の実測データに変換する検証台帳。"><meta property="og:url" content="${BASE}/pilots/">
    <meta name="twitter:card" content="summary"><title>0円実測Pilot｜わらしべ Asset Radar</title><link rel="stylesheet" href="../styles.css">
  </head><body>
    <header class="site-header"><div class="shell header-inner"><div><p class="eyebrow">ZERO-COST PILOTS</p><h1>0円実測Pilot</h1><p class="subtitle">推測の期待値を、7日間の独自実測データへ変える。</p></div><a class="header-badge" href="../">Radarへ戻る</a></div></header>
    <main class="shell">
      <nav class="asset-nav"><a href="../">全案件</a><a href="../discovery/">候補発見</a><a href="../rankings/zero-yen.html">0円ランキング</a><a href="../methodology/">評価方法</a><a href="../updates/">更新履歴</a></nav>
      <section class="ranking-hero"><p class="eyebrow">PILOT STATUS</p><h2>7日間ベースライン検証</h2><p>課金・紹介・複垢・位置偽装・地域制限回避を使わず、無料標準条件だけで獲得速度と負担を測ります。</p><div class="ranking-meta"><span>開始待ち <b>${ready}</b></span><span>実測中 <b>${running}</b></span><span>完了 <b>${completed}</b></span><span>期間 <b>${esc(payload.pilot_duration_days)}日</b></span><span>更新 <b>${esc(payload.updated_at)}</b></span></div></section>
      <section class="score-guide"><h2>実測ルール</h2><ul class="conditions"><li>自己資金・有料サブスク・有料Boostは使わない</li><li>基準期間は紹介報酬を混ぜない</li><li>1人1アカウント。位置偽装・VPN地域回避・エミュレータ悪用は禁止</li><li>開始残高と終了残高、実作業時間、端末負担を記録する</li><li>ポイント・抽選券・将来権利と、受領済み暗号資産を分けて記録する</li></ul><p>${esc(policy.principle ?? '')}</p></section>
      <section class="cards">${pilots.map(card).join('\n')}</section>
      <section class="score-guide"><h2>判定方法</h2><p>7日終了後に「1日あたり獲得量」「実作業1分あたり獲得量」「実際に換金可能か」「バッテリー/通信/プライバシー負担」を比較し、Radarの期待値・時間効率・リスク点を更新します。未受領の将来AirdropはSEV、受領済み資産のみConfirmedへ移します。</p></section>
    </main><footer class="shell footer"><p>実測値は個人環境に依存します。Pilotは成果保証ではなく、候補選別のための一次検証です。</p></footer>
  </body></html>`;
}

async function htmlFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(path));
    else if (extname(entry.name) === '.html') files.push(path);
  }
  return files;
}

function pilotLink(file) {
  const rel = relative(output, file).replaceAll('\\', '/');
  const prefix = '../'.repeat(rel.split('/').length - 1);
  return `<nav class="asset-nav" data-generated="pilot-link" aria-label="0円実測"><a href="${prefix}pilots/">0円実測</a></nav>`;
}

const payload = JSON.parse(await readFile(resolve(root, 'data', 'pilots.json'), 'utf8'));
await mkdir(resolve(output, 'pilots'), { recursive: true });
await writeFile(resolve(output, 'pilots', 'index.html'), render(payload), 'utf8');

for (const file of await htmlFiles(output)) {
  if (file.includes('/pilots/')) continue;
  let html = await readFile(file, 'utf8');
  if (html.includes('data-generated="pilot-link"')) continue;
  const main = html.indexOf('<main');
  const navEnd = html.indexOf('</nav>', main);
  if (main !== -1 && navEnd !== -1) {
    html = `${html.slice(0, navEnd + 6)}\n${pilotLink(file)}${html.slice(navEnd + 6)}`;
    await writeFile(file, html, 'utf8');
  }
}

const sitemapPath = resolve(output, 'sitemap.xml');
let sitemap = await readFile(sitemapPath, 'utf8');
const url = `${BASE}/pilots/`;
if (!sitemap.includes(`<loc>${url}</loc>`)) {
  sitemap = sitemap.replace('</urlset>', `  <url>\n    <loc>${url}</loc>\n    <lastmod>${esc(payload.updated_at)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>`);
  await writeFile(sitemapPath, sitemap, 'utf8');
}

console.log(`Generated pilot dashboard: ${payload.pilots?.length ?? 0} pilots.`);
