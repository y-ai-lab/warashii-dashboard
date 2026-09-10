import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const BASE_URL = 'https://y-ai-lab.github.io/warashii-dashboard';
const HOST = new URL(BASE_URL).host;
const KEY = '295d1f0bddf4348090c0b40d61ca46c6';
const KEY_LOCATION = `${BASE_URL}/${KEY}.txt`;

function detailUrl(id) {
  return `${BASE_URL}/opportunities/${encodeURIComponent(id)}.html`;
}

function readOldOpportunities() {
  try {
    const raw = execFileSync('git', ['show', 'HEAD^:data/opportunities.json'], { encoding: 'utf8' });
    return JSON.parse(raw).opportunities ?? [];
  } catch {
    return null;
  }
}

function changedFiles() {
  try {
    return execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], { encoding: 'utf8' })
      .split('\n')
      .map(value => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const currentPayload = JSON.parse(await readFile(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
const current = currentPayload.opportunities ?? [];
const previous = readOldOpportunities();
const files = changedFiles();
const urls = new Set();

const rankings = [
  `${BASE_URL}/rankings/zero-yen.html`,
  `${BASE_URL}/rankings/top-score.html`,
  `${BASE_URL}/rankings/review.html`,
];

const allCurrentDetailUrls = current.map(item => detailUrl(item.id));

if (!previous || files.includes('scripts/build.mjs')) {
  urls.add(`${BASE_URL}/`);
  rankings.forEach(url => urls.add(url));
  allCurrentDetailUrls.forEach(url => urls.add(url));
} else {
  if (files.some(file => ['index.html', 'app.js'].includes(file))) {
    urls.add(`${BASE_URL}/`);
  }

  if (files.some(file => file === 'rankings.js' || file.startsWith('rankings/'))) {
    rankings.forEach(url => urls.add(url));
  }

  if (files.includes('styles.css')) {
    urls.add(`${BASE_URL}/`);
    rankings.forEach(url => urls.add(url));
    allCurrentDetailUrls.forEach(url => urls.add(url));
  }

  if (files.includes('data/opportunities.json')) {
    urls.add(`${BASE_URL}/`);
    rankings.forEach(url => urls.add(url));

    const oldMap = new Map(previous.map(item => [item.id, JSON.stringify(item)]));
    const newMap = new Map(current.map(item => [item.id, JSON.stringify(item)]));
    const ids = new Set([...oldMap.keys(), ...newMap.keys()]);
    for (const id of ids) {
      if (oldMap.get(id) !== newMap.get(id)) urls.add(detailUrl(id));
    }
  }
}

const urlList = [...urls];
if (urlList.length === 0) {
  console.log('IndexNow: no search-relevant URL changes detected; skipping submission.');
  process.exit(0);
}

if (urlList.length > 10000) {
  throw new Error(`IndexNow URL batch too large: ${urlList.length}`);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  }),
});

const body = await response.text();
console.log(`IndexNow response: HTTP ${response.status}`);
console.log(`Submitted URLs: ${urlList.length}`);
for (const url of urlList) console.log(`- ${url}`);
if (body) console.log(body);

if (!response.ok) {
  throw new Error(`IndexNow submission failed with HTTP ${response.status}`);
}
