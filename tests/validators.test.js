const test = require('node:test');
const assert = require('node:assert/strict');

const { validateArticleNumber, parseCommandArgs } = require('../utils/validators');

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
