import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const database = JSON.parse(
  await readFile(new URL('../data/opportunities.json', import.meta.url), 'utf8'),
);

test('opportunity identifiers are unique', () => {
  const ids = database.opportunities.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
});

test('score components add up to a valid score', () => {
  for (const opportunity of database.opportunities) {
    const score = Object.values(opportunity.score_components).reduce(
      (total, component) => total + component,
      0,
    );
    assert.ok(score >= 0 && score <= 100, `${opportunity.id}: ${score}`);
  }
});

test('source URLs use HTTPS', () => {
  for (const opportunity of database.opportunities) {
    assert.match(opportunity.source_url, /^https:\/\//, opportunity.id);
  }
});
