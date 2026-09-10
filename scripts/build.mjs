import { cp, mkdir, readFile, rm } from 'node:fs/promises';
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

await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });

for (const file of files) {
  await cp(resolve(root, file), resolve(output, file), { recursive: true });
}

const html = await readFile(resolve(output, 'index.html'), 'utf8');
if (!html.includes('styles.css') || !html.includes('app.js')) {
  throw new Error('Built index.html does not reference the application assets.');
}

for (const page of ['zero-yen.html', 'top-score.html', 'review.html']) {
  const pageHtml = await readFile(resolve(output, 'rankings', page), 'utf8');
  if (!pageHtml.includes('../rankings.js') || !pageHtml.includes('../styles.css')) {
    throw new Error(`Built rankings/${page} is missing shared assets.`);
  }
}

console.log(`Built ${files.length} assets in dist/`);
