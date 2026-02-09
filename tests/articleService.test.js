const test = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');

const articleService = require('../services/articleService');

test('parseReactSectionFromDom stops at next major heading', () => {
  const html = `
    <html><body>
      <h1>This Week In React 999</h1>
      <h2>⚛️ React</h2>
      <p><a href="https://example.com/featured">Featured article</a></p>
      <ul>
        <li><a href="https://example.com/a">A</a></li>
        <li><a href="https://example.com/b">B</a></li>
      </ul>
      <h2>React Native</h2>
      <ul>
        <li><a href="https://example.com/should-not-appear">Nope</a></li>
      </ul>
    </body></html>
  `;

  const $ = cheerio.load(html);
  const parsed = articleService._parseReactSectionFromDom($, 'https://thisweekinreact.com/newsletter/999');

  assert.equal(parsed.featured.url, 'https://example.com/featured');
  assert.equal(parsed.items.length, 2);
  assert.deepEqual(
    parsed.items.map((i) => i.url),
    ['https://example.com/a', 'https://example.com/b']
  );
});
