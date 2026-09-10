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

const STALE_DAYS = 14;
let opportunities = [];

function scoreOf(item) {
  return Object.entries(SCORE_MAX).reduce((sum, [key, max]) => {
    const value = Number(item.score_components?.[key] ?? 0);
    return sum + Math.min(Math.max(value, 0), max);
  }, 0);
}

function daysSince(dateString) {
  const then = new Date(`${dateString}T00:00:00`);
  const now = new Date();
  return Math.floor((now - then) / 86400000);
}

function isStale(item) {
  return !item.verified_at || daysSince(item.verified_at) > STALE_DAYS;
}

function yen(value) {
  if (value === null || value === undefined) return '不明';
  return `¥${Number(value).toLocaleString('ja-JP')}`;
}

function mobileLabel(value) {
  return ({ yes: '◎', partial: '○ 一部PC推奨', no: '×' })[value] ?? value;
}

function addCategories(items) {
  const select = document.querySelector('#categoryFilter');
  const categories = [...new Set(items.map(x => x.category))].sort((a,b)=>a.localeCompare(b,'ja'));
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
}

function renderKpis(items) {
  document.querySelector('#kpiTotal').textContent = items.length;
  document.querySelector('#kpiGo').textContent = items.filter(x => x.recommendation === 'GO').length;
  document.querySelector('#kpiZero').textContent = items.filter(x => Number(x.required_funds_yen) === 0).length;
  document.querySelector('#kpiStale').textContent = items.filter(isStale).length;
}

function renderCard(item) {
  const tpl = document.querySelector('#cardTemplate');
  const card = tpl.content.firstElementChild.cloneNode(true);
  const score = scoreOf(item);
  const stale = isStale(item);

  const rec = card.querySelector('.rec');
  rec.textContent = item.recommendation;
  rec.dataset.rec = item.recommendation;
  card.querySelector('.category').textContent = item.category;

  const freshness = card.querySelector('.freshness');
  freshness.textContent = stale ? '要再確認' : '確認済み';
  freshness.classList.toggle('stale', stale);

  card.querySelector('.title').textContent = item.title;
  card.querySelector('.provider').textContent = `${item.provider} ・ ${item.asset_type}`;
  card.querySelector('.score strong').textContent = score;
  card.querySelector('.reward').textContent = item.reward_label;
  card.querySelector('.funds').textContent = yen(item.required_funds_yen);
  card.querySelector('.work').textContent = item.work_time_label;
  card.querySelector('.days').textContent = item.acquisition_days_label;
  card.querySelector('.risk').textContent = item.risk_label;
  card.querySelector('.mobile').textContent = mobileLabel(item.mobile);
  card.querySelector('.deadline').textContent = item.deadline_label ?? '未定/随時';
  card.querySelector('.conversion').textContent = `変換ルート：${item.conversion_route}`;

  const conditions = card.querySelector('.conditions');
  (item.conditions ?? []).forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    conditions.appendChild(li);
  });

  const breakdown = card.querySelector('.score-breakdown');
  Object.entries(SCORE_MAX).forEach(([key, max]) => {
    const span = document.createElement('span');
    span.textContent = `${SCORE_LABELS[key]} ${item.score_components?.[key] ?? 0}/${max}`;
    breakdown.appendChild(span);
  });

  card.querySelector('.notes').textContent = item.notes ?? '';
  card.querySelector('.verified').textContent = `最終確認：${item.verified_at ?? '未確認'}`;
  const source = card.querySelector('.source');
  source.href = item.source_url;
  source.textContent = item.source_name ?? '一次情報';

  return card;
}

function filteredItems() {
  const q = document.querySelector('#searchInput').value.trim().toLowerCase();
  const category = document.querySelector('#categoryFilter').value;
  const rec = document.querySelector('#recommendationFilter').value;
  const sort = document.querySelector('#sortSelect').value;

  const result = opportunities.filter(item => {
    const haystack = [item.title, item.provider, item.category, item.asset_type, item.reward_label, item.notes, ...(item.conditions ?? [])].join(' ').toLowerCase();
    return (!q || haystack.includes(q)) && (category === 'all' || item.category === category) && (rec === 'all' || item.recommendation === rec);
  });

  result.sort((a,b) => {
    if (sort === 'fresh') return String(b.verified_at).localeCompare(String(a.verified_at));
    if (sort === 'value') return Number(b.potential_value_yen ?? -1) - Number(a.potential_value_yen ?? -1);
    if (sort === 'time') return Number(a.work_minutes ?? 99999) - Number(b.work_minutes ?? 99999);
    return scoreOf(b) - scoreOf(a);
  });
  return result;
}

function render() {
  const cards = document.querySelector('#cards');
  const empty = document.querySelector('#emptyState');
  const items = filteredItems();
  cards.replaceChildren(...items.map(renderCard));
  empty.hidden = items.length !== 0;
  renderKpis(opportunities);
}

async function init() {
  try {
    const response = await fetch('data/opportunities.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    opportunities = payload.opportunities ?? [];
    addCategories(opportunities);
    ['searchInput','categoryFilter','recommendationFilter','sortSelect'].forEach(id => {
      document.querySelector(`#${id}`).addEventListener(id === 'searchInput' ? 'input' : 'change', render);
    });
    render();
  } catch (error) {
    document.querySelector('#cards').innerHTML = `<article class="card"><h2>データを読み込めませんでした</h2><p class="muted">${String(error.message || error)}</p></article>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
