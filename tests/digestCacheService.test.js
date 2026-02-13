const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;

const digestCacheService = require('../services/digestCacheService');
const { DIGEST_CACHE_FILE } = require('../config/constants');

test('digest cache stores and returns entry by issue/model', async () => {
  try {
    await fs.unlink(DIGEST_CACHE_FILE);
  } catch {}

  await digestCacheService.set(321, 'gpt-4.1', {
    content: 'cached digest text',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  });

  const cached = await digestCacheService.get(321, 'gpt-4.1');
  assert.ok(cached);
  assert.equal(cached.issueNumber, 321);
  assert.equal(cached.model, 'gpt-4.1');
  assert.equal(cached.content, 'cached digest text');
  assert.equal(cached.usage.totalTokens, 30);
});
