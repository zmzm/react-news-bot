const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateNestedUrl,
  assertExternalUrlResolvesPublicly,
} = require('../utils/urlValidator');

test('validateNestedUrl rejects localhost', () => {
  assert.throws(() => validateNestedUrl('http://localhost:8080/path'), /not allowed/i);
});

test('validateNestedUrl rejects credentials in URL', () => {
  assert.throws(() => validateNestedUrl('https://user:pass@example.com/path'), /credentials/i);
});

test('assertExternalUrlResolvesPublicly rejects private IP literal', async () => {
  await assert.rejects(
    () => assertExternalUrlResolvesPublicly('http://127.0.0.1/internal'),
    /local\/internal/i
  );
});

test('assertExternalUrlResolvesPublicly allows public IP literal', async () => {
  await assert.doesNotReject(() => assertExternalUrlResolvesPublicly('https://8.8.8.8/'));
});
