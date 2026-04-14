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
  assert.equal(parsed.publishedDate, null);
  assert.deepEqual(
    parsed.items.map((i) => i.url),
    ['https://example.com/a', 'https://example.com/b']
  );
});

test('parseReactSectionFromDom extracts published date from <time datetime>', () => {
  const html = `
    <html><body>
      <h1>This Week In React 275</h1>
      <time datetime="2026-04-01T00:00:00.000Z">April 1, 2026</time>
      <h2>⚛️ React</h2>
      <ul>
        <li><a href="https://example.com/a">A</a></li>
      </ul>
    </body></html>
  `;

  const $ = cheerio.load(html);
  const parsed = articleService._parseReactSectionFromDom(
    $,
    'https://thisweekinreact.com/newsletter/275'
  );

  assert.equal(parsed.publishedDate, '2026-04-01');
});

test('extractLinksFromList keeps only the primary link from each list item', () => {
  const html = `
    <html><body>
      <ul>
        <li>
          📜 <a href="https://engineering.gusto.com/safer-frontend">The Journey to a Safer Frontend: Why Gusto Removed</a>
          <a href="http://react.fc/"><code>React.FC</code></a>
        </li>
        <li>
          <a href="https://base-ui.com/release">Base UI 1.2 - Drawer component, support lazy/async components</a>
          <a href="https://base-ui.com/docs">docs</a>
        </li>
      </ul>
    </body></html>
  `;

  const $ = cheerio.load(html);
  const items = articleService._extractLinksFromList(
    $,
    $('ul').first(),
    'https://thisweekinreact.com/newsletter/269'
  );

  assert.deepEqual(
    items.map((item) => item.title),
    [
      'The Journey to a Safer Frontend: Why Gusto Removed',
      'Base UI 1.2 - Drawer component, support lazy/async components',
    ]
  );
  assert.deepEqual(
    items.map((item) => item.url),
    [
      'https://engineering.gusto.com/safer-frontend',
      'https://base-ui.com/release',
    ]
  );
});
