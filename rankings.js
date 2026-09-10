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

const STALE_DAYS = 14;

function scoreOf(item) {
  return Object.entries(SCORE_MAX).reduce((sum, [key, max]) => {
    const value = Number(item.score_components?.[key] ?? 0);
    return sum + Math.min(Math.max(value, 0), max);
  }, 0);
}

function daysSince(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(`${dateString}T00:00:00`);
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

function isStale(item) {
  return daysSince(item.verified_at) > STALE_DAYS;
}

function yen(value) {
  if (value === null || value === undefined) return '不明';
  return `¥${Number(value).toLocaleString('ja-JP')}`;
}

function mobileLabel(value) {
  return ({ yes: '◎', partial: '○ 一部PC推奨', no: '×' })[value] ?? value;
}

function recommendationWeight(value) {
  return ({ GO: 3, WATCH: 2, STOP: 1 })[value] ?? 0;
}

function reviewPriority(item) {
  let priority = 0;
  if (isStale(item)) priority += 100;
  if (item.recommendation === 'WATCH') priority += 40;
  if (item.recommendation === 'STOP') priority += 20;
  const deadline = String(item.deadline_label ?? '');
  if (/掲載終了|終了|Active|要確認|変動/.test(deadline)) priority += 15;
  if (String(item.source_name ?? '').includes('案件ページ')) priority += 5;
  return priority;
}

function selectItems(items, mode) {
  if (mode === 'zero') {
    return items
      .filter(item => Number(item.required_funds_yen ?? 0) === 0)
      .sort((a, b) =>
        recommendationWeight(b.recommendation) - recommendationWeight(a.recommendation) ||
        scoreOf(b) - scoreOf(a) ||
        Number(b.potential_value_yen ?? -1) - Number(a.potential_value_yen ?? -1)
      );
  }

  if (mode === 'top') {
    return [...items]
      .sort((a, b) => scoreOf(b) - scoreOf(a) || recommendationWeight(b.recommendation) - recommendationWeight(a.recommendation))
      .slice(0, 10);
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

function renderCard(item, index) {
  const article = document.createElement('article');
  article.className = 'card';

  const top = document.createElement('div');
  top.className = 'card-top';

  const left = document.createElement('div');
  const badges = document.createElement('div');
  badges.className = 'badges';

  const rank = document.createElement('span');
  rank.className = 'badge category';
  rank.textContent = `#${index + 1}`;

  const rec = document.createElement('span');
  rec.className = 'badge rec';
  rec.dataset.rec = item.recommendation;
  rec.textContent = item.recommendation;

  const category = document.createElement('span');
  category.className = 'badge category';
  category.textContent = item.category;

  const freshness = document.createElement('span');
  freshness.className = 'badge freshness';
  freshness.textContent = isStale(item) ? '要再確認' : '確認済み';
  freshness.classList.toggle('stale', isStale(item));

  badges.append(rank, rec, category, freshness);

  const title = document.createElement('h2');
  title.className = 'title';
  title.textContent = item.title;

  const provider = document.createElement('p');
  provider.className = 'provider';
  provider.textContent = `${item.provider} ・ ${item.asset_type}`;

  left.append(badges, title, provider);

  const score = document.createElement('div');
  score.className = 'score';
  score.innerHTML = `<strong>${scoreOf(item)}</strong><span>/100</span>`;

  top.append(left, score);

  const reward = document.createElement('div');
  reward.className = 'reward';
  reward.textContent = item.reward_label;

  const facts = document.createElement('dl');
  facts.className = 'facts';
  const factRows = [
    ['必要資金', yen(item.required_funds_yen)],
    ['作業時間', item.work_time_label],
    ['獲得まで', item.acquisition_days_label],
    ['Risk', item.risk_label],
    ['スマホ', mobileLabel(item.mobile)],
    ['期限', item.deadline_label ?? '未定/随時'],
  ];
  for (const [label, value] of factRows) {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    div.append(dt, dd);
    facts.appendChild(div);
  }

  const conversion = document.createElement('p');
  conversion.className = 'conversion';
  conversion.textContent = `変換ルート：${item.conversion_route}`;

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '条件・補足';
  const conditions = document.createElement('ul');
  conditions.className = 'conditions';
  for (const text of item.conditions ?? []) {
    const li = document.createElement('li');
    li.textContent = text;
    conditions.appendChild(li);
  }
  const notes = document.createElement('p');
  notes.className = 'notes';
  notes.textContent = item.notes ?? '';
  details.append(summary, conditions, notes);

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const verified = document.createElement('span');
  verified.className = 'verified';
  verified.textContent = `最終確認：${item.verified_at ?? '未確認'}`;
  const source = document.createElement('a');
  source.className = 'source';
  source.href = item.source_url;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = item.source_name ?? '一次情報';
  footer.append(verified, source);

  article.append(top, reward, facts, conversion, details, footer);
  return article;
}

async function initRanking() {
  const mode = document.body.dataset.ranking;
  const cards = document.querySelector('#rankingCards');
  const count = document.querySelector('#rankingCount');
  const checked = document.querySelector('#rankingChecked');

  try {
    const response = await fetch('../data/opportunities.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const selected = selectItems(payload.opportunities ?? [], mode);
    cards.replaceChildren(...selected.map(renderCard));
    count.textContent = selected.length;
    checked.textContent = payload.updated_at ?? '不明';
  } catch (error) {
    cards.innerHTML = `<article class="card"><h2>データを読み込めませんでした</h2><p class="muted">${String(error.message || error)}</p></article>`;
  }
}

document.addEventListener('DOMContentLoaded', initRanking);
