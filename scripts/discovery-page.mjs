import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const BASE = 'https://y-ai-lab.github.io/warashii-dashboard';
const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const trust = v => v === 'platform_signal' ? 'Platform signal' : v === 'community_signal' ? 'Community signal' : (v || 'Unknown signal');

function pendingCard(x) {
  return `<article class="card"><div class="badges"><span class="badge rec" data-rec="STOP">未検証</span><span class="badge category">${esc(trust(x.trust))}</span><span class="badge freshness">強度 ${esc(x.signal_strength)}/5</span></div><h2 class="title">${esc(x.title)}</h2><p class="provider">${esc(x.source_name)}</p><div class="reward">REVIEW_REQUIRED / NOT_SCORED</div><dl class="facts"><div><dt>発見日</dt><dd>${esc(x.discovered_at)}</dd></div><div><dt>最終検出</dt><dd>${esc(x.last_seen_at)}</dd></div><div><dt>実行可否</dt><dd>禁止（未検証）</dd></div></dl><p class="conversion">発見理由：${esc(x.reason)}</p><p class="notes">公式情報・0円条件・地域/KYC・Hard Gate・100点評価の確認が終わるまで実行しません。</p><div class="card-footer"><a class="source" href="${esc(x.candidate_url)}" target="_blank" rel="noopener noreferrer">候補シグナルを見る</a></div></article>`;
}

function reviewedCard(x) {
  const unresolved = (x.unresolved ?? []).map(v => `<li>${esc(v)}</li>`).join('');
  const sources = (x.official_sources ?? []).map((url,i) => `<a class="source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">公式${i+1}</a>`).join('');
  return `<article class="card"><div class="card-top"><div><div class="badges"><span class="badge rec" data-rec="WATCH">WATCH</span><span class="badge category">公式確認済み候補</span><span class="badge freshness">${esc(x.reviewed_at)}</span></div><h2 class="title">${esc(x.title)}</h2><p class="provider">Discovery review</p></div><div class="score"><strong>${esc(x.score ?? '-')}</strong><span>/100</span></div></div><div class="reward">${esc(x.reward_label ?? '価値未確定')}</div><dl class="facts"><div><dt>必要資金</dt><dd>${Number(x.required_funds_yen ?? 0)===0?'¥0':`¥${esc(x.required_funds_yen)}`}</dd></div><div><dt>Risk</dt><dd>${esc(x.risk_label)}</dd></div><div><dt>スマホ</dt><dd>${esc(x.mobile)}</dd></div><div><dt>Radar昇格</dt><dd>${x.promotion_ready?'可能':'保留'}</dd></div></dl><p class="conversion">変換ルート：${esc(x.conversion_route)}</p><p class="notes">${esc(x.review_note)}</p>${unresolved?`<details><summary>未解決条件</summary><ul class="conditions">${unresolved}</ul></details>`:''}${sources?`<div class="card-footer">${sources}</div>`:''}</article>`;
}

function render(queue, summary) {
  const all = queue.candidates ?? [];
  const pending = all.filter(x => x.status === 'REVIEW_REQUIRED');
  const reviewed = all.filter(x => x.status === 'REVIEWED_WATCH');
  const p = pending.length ? pending.map(pendingCard).join('\n') : '<p class="empty">現在、未検証のレビュー待ち候補はありません。</p>';
  const r = reviewed.length ? reviewed.map(reviewedCard).join('\n') : '<p class="empty">現在、レビュー済みWATCH候補はありません。</p>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="わらしべ Asset RadarのOpportunity Discovery。未検証候補と公式確認後のWATCH候補を分離して公開。"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${BASE}/discovery/"><link rel="alternate" type="application/rss+xml" title="わらしべ Asset Radar 更新フィード" href="${BASE}/feed.xml"><meta property="og:type" content="website"><meta property="og:locale" content="ja_JP"><meta property="og:site_name" content="わらしべ Asset Radar"><meta property="og:title" content="Opportunity Discovery｜わらしべ Asset Radar"><meta property="og:description" content="未検証候補とレビュー済みWATCHを隔離して管理。"><meta property="og:url" content="${BASE}/discovery/"><meta name="twitter:card" content="summary"><title>Opportunity Discovery｜わらしべ Asset Radar</title><link rel="stylesheet" href="../styles.css"></head><body><header class="site-header"><div class="shell header-inner"><div><p class="eyebrow">OPPORTUNITY DISCOVERY</p><h1>候補発見・レビューキュー</h1><p class="subtitle">発見と採用を分離し、未確定案件をRadar本体へ混ぜない。</p></div><a class="header-badge" href="../">Radarへ戻る</a></div></header><main class="shell"><nav class="asset-nav"><a href="../">全案件</a><a href="../rankings/zero-yen.html">0円ランキング</a><a href="../categories/">カテゴリ</a><a href="../methodology/">評価方法</a><a href="../updates/">更新履歴</a></nav><section class="score-guide" style="border-width:2px"><h2>⚠ 発見シグナル ≠ 推薦</h2><p><b>REVIEW_REQUIRED は実行禁止。</b> REVIEWED_WATCHも不確定条件が残るため、Radar本体への昇格・実行推奨とは別扱いです。</p></section><section class="ranking-hero"><p class="eyebrow">DISCOVERY STATUS</p><h2>候補発見エンジン</h2><p>プラットフォームやGitHubは発見用にのみ使い、判断はプロジェクト自身の公式情報へ戻します。</p><div class="ranking-meta"><span>未検証 <b>${pending.length}</b></span><span>レビュー済WATCH <b>${reviewed.length}</b></span><span>今回新規 <b>${esc(summary.new_count??0)}</b></span><span>ノイズ除外 <b>${esc(summary.noise_pruned??0)}</b></span><span>エラー <b>${esc(summary.error_count??0)}</b></span><span>最終探索 <b>${esc(summary.generated_at??queue.generated_at??'未実行')}</b></span></div></section><section class="score-guide"><h2>未検証候補</h2><p>実行禁止の隔離領域です。</p></section><section class="cards">${p}</section><section class="score-guide"><h2>レビュー済みWATCH</h2><p>公式確認済みでも、価値・地域・受領条件などが未確定でRadar昇格を保留している候補です。</p></section><section class="cards">${r}</section><section class="score-guide"><h2>Radar採用までのゲート</h2><ol class="conditions"><li>公式サイト / Docs / 公式SNSを特定</li><li>0円開始と0円継続を分離確認</li><li>地域・KYC・資金・規約・Hard Gateを確認</li><li>100点評価でGO/WATCH/STOPを決定</li><li>必要条件が十分確認できたものだけRadar本体へ追加</li></ol></section></main><footer class="shell footer"><p>Discoveryは候補探索の情報資産です。未確定情報をRadar本体から隔離して管理します。</p></footer></body></html>`;
}

async function htmlFiles(dir) {
  const out=[];
  for (const e of await readdir(dir,{withFileTypes:true})) {
    const p=join(dir,e.name);
    if(e.isDirectory()) out.push(...await htmlFiles(p)); else if(extname(e.name)==='.html') out.push(p);
  }
  return out;
}

function discoveryLink(file) {
  const rel=relative(output,file).replaceAll('\\','/');
  const prefix='../'.repeat(rel.split('/').length-1);
  return `<nav class="asset-nav" data-generated="discovery-link" aria-label="新規案件候補"><a href="${prefix}discovery/">候補発見</a></nav>`;
}

const queue=JSON.parse(await readFile(resolve(root,'data','discovery_queue.json'),'utf8'));
const summary=JSON.parse(await readFile(resolve(root,'data','discovery','summary.json'),'utf8'));
await mkdir(resolve(output,'discovery'),{recursive:true});
await writeFile(resolve(output,'discovery','index.html'),render(queue,summary),'utf8');
for(const file of await htmlFiles(output)){
  if(file.includes('/discovery/')) continue;
  let html=await readFile(file,'utf8');
  if(html.includes('data-generated="discovery-link"')) continue;
  const m=html.indexOf('<main'), n=html.indexOf('</nav>',m);
  if(m!==-1&&n!==-1){html=`${html.slice(0,n+6)}\n${discoveryLink(file)}${html.slice(n+6)}`;await writeFile(file,html,'utf8');}
}
const sitemapPath=resolve(output,'sitemap.xml');
let sitemap=await readFile(sitemapPath,'utf8');
const url=`${BASE}/discovery/`;
if(!sitemap.includes(`<loc>${url}</loc>`)){
  const lastmod=(queue.generated_at??new Date().toISOString()).slice(0,10);
  sitemap=sitemap.replace('</urlset>',`  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>`);
  await writeFile(sitemapPath,sitemap,'utf8');
}
console.log(`Generated public discovery queue: ${queue.candidates?.length ?? 0} candidates.`);
