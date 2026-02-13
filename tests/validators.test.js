const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateArticleNumber,
  parseCommandArgs,
  parseSearchQuery,
} = require('../utils/validators');

test('validateArticleNumber accepts plain digits', () => {
  const result = validateArticleNumber('260');
  assert.equal(result.valid, true);
  assert.equal(result.value, 260);
});

test('validateArticleNumber rejects mixed digits and letters', () => {
  const result = validateArticleNumber('260abc');
  assert.equal(result.valid, false);
  assert.match(result.error, /digits only/i);
});

test('parseCommandArgs handles command with bot username', () => {
  const args = parseCommandArgs('/article@mybot 260');
  assert.deepEqual(args, ['260']);
});

test('parseSearchQuery parses mixed text and filters', () => {
  const parsed = parseSearchQuery('hooks featured since:250 limit:5');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.filters.query, 'hooks');
  assert.equal(parsed.filters.type, 'featured');
  assert.equal(parsed.filters.sinceIssue, 250);
  assert.equal(parsed.filters.limit, 5);
});

test('parseSearchQuery parses issue shorthand', () => {
  const parsed = parseSearchQuery('#262');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.filters.issueNumber, 262);
  assert.equal(parsed.filters.query, '');
});

test('parseSearchQuery rejects empty filters and text', () => {
  const parsed = parseSearchQuery(' ');
  assert.equal(parsed.valid, false);
});

test('parseSearchQuery rejects out-of-range limit', () => {
  const parsed = parseSearchQuery('react limit:99');
  assert.equal(parsed.valid, false);
  assert.match(parsed.error, /limit/i);
});
