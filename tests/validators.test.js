const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateArticleNumber,
  parseCommandArgs,
  parseSearchQuery,
  validateObsidianIssueNotes,
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

test('validateObsidianIssueNotes normalizes canonical links', () => {
  const payload = {
    issue: 260,
    issue_title: 'This Week In React #260: React Compiler, Vite',
    date: '2026-04-02',
    source_url: 'https://thisweekinreact.com/newsletter/260',
    moc_tags: ['Next.js', 'React Compiler'],
    tldr: ['one', 'two'],
    topics: [
      { name: 'RSC', summary: 'Server-side UI decomposition.', obsidian_link: 'rsc' },
    ],
    items: [
      {
        title: 'React Compiler deep dive',
        url: 'https://example.com/react-compiler',
        type: 'featured',
        notes: 'Useful summary.',
        takeaways: ['Compiler uses static analysis.'],
        recommendation: 'Read fully',
        recommendation_reason: 'important internals context',
        entities: ['react compiler'],
        obsidian_links: ['react compiler', 'rsc', 'Next.js Platform Expansion'],
        tags: ['Next.js', 'React Compiler'],
      },
    ],
    action_items: ['Try compiler flags'],
    related_notes: ['nextjs'],
  };

  const validated = validateObsidianIssueNotes(payload);
  assert.equal(validated.valid, true);
  assert.equal(validated.value.issue_title, 'This Week In React #260: React Compiler, Vite');
  assert.equal(validated.value.topics[0].obsidian_link, 'Server Components');
  assert.equal(validated.value.items[0].type, 'featured');
  assert.equal(validated.value.items[0].recommendation, 'Read fully');
  assert.equal(validated.value.items[0].recommendation_reason, 'important internals context');
  assert.deepEqual(validated.value.items[0].takeaways, ['Compiler uses static analysis.']);
  assert.deepEqual(validated.value.items[0].obsidian_links, ['React Compiler', 'Server Components']);
  assert.deepEqual(validated.value.items[0].tags, ['Next.js', 'React Compiler']);
  assert.deepEqual(validated.value.moc_tags, ['Next.js', 'React Compiler']);
  assert.deepEqual(validated.value.related_notes, ['Next.js']);
});

test('validateObsidianIssueNotes rejects non-https URLs', () => {
  const payload = {
    issue: 260,
    date: '2026-04-02',
    source_url: 'http://thisweekinreact.com/newsletter/260',
    tldr: [],
    topics: [],
    items: [],
    action_items: [],
    related_notes: [],
  };

  const validated = validateObsidianIssueNotes(payload);
  assert.equal(validated.valid, false);
  assert.match(validated.error, /https URL/i);
});
