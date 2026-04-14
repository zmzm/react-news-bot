const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const obsidianService = require("../services/obsidianService");
const scraper = require("../services/scraper");

test("obsidianService renders deterministic markdown", () => {
  const payload = {
    issue: 260,
    issue_title: "This Week In React #260: React Compiler, Vite",
    date: "2026-04-02",
    source_url: "https://thisweekinreact.com/newsletter/260",
    moc_tags: ["Next.js", "TanStack RSC", "React Compiler"],
    tldr: ["React Compiler updates landed.", "Vite ecosystem changes."],
    topics: [
      {
        name: "React Compiler",
        summary: "Compilation path gets more practical for real projects.",
        obsidian_link: "React Compiler",
      },
    ],
    items: [
      {
        title: "Deep dive into compiler internals",
        url: "https://example.com/compiler",
        type: "featured",
        notes: "Covers constraints and migration sequence.",
        takeaways: ["Adapters simplify cross-platform deploy."],
        recommendation: "Read fully",
        recommendation_reason: "useful for architecture decisions",
        entities: ["React Compiler"],
        tags: ["React Compiler", "Next.js"],
        obsidian_links: ["React Compiler"],
      },
    ],
    action_items: ["Read compiler RFC appendix."],
    related_notes: ["This Week in React Index"],
  };

  const markdown = obsidianService.renderIssueMarkdown(payload);

  assert.match(markdown, /# This Week in React #260/);
  assert.match(markdown, /type: twir-issue/);
  assert.match(markdown, /tags:\n  - "Nextjs"\n  - "TanStackRSC"\n  - "ReactCompiler"/);
  assert.match(markdown, /## Featured/);
  assert.match(markdown, /Key takeaways:/);
  assert.match(markdown, /- Adapters simplify cross-platform deploy\./);
  assert.match(markdown, /Recommendation: Read fully \(useful for architecture decisions\)/);
  assert.match(markdown, /\[\[React Compiler\]\]/);
  assert.match(markdown, /\[Deep dive into compiler internals\]\(https:\/\/example.com\/compiler\)/);
});

test("obsidianService returns stable file name", () => {
  const payload = {
    issue: 260,
    issue_title: "",
    date: "2026-04-02",
    source_url: "https://thisweekinreact.com/newsletter/260",
    tldr: [],
    topics: [],
    items: [],
    action_items: [],
    related_notes: [],
  };

  assert.equal(
    obsidianService.getIssueNoteFileName(payload),
    "2026-04-02 - TWIR #260.md"
  );
});

test("obsidianService saves markdown file into vault", async () => {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "twir-vault-"));
  const payload = {
    issue: 261,
    issue_title: "This Week In React #261: Vite, Node",
    date: "2026-04-09",
    source_url: "https://thisweekinreact.com/newsletter/261",
    moc_tags: ["Vite", "Node"],
    tldr: ["Short summary."],
    topics: [
      {
        name: "Vite",
        summary: "Tooling update.",
        obsidian_link: "Vite",
      },
    ],
    items: [
      {
        title: "Vite release",
        url: "https://example.com/vite",
        type: "item",
        notes: "Has migration details.",
        takeaways: ["New release includes migration tooling."],
        recommendation: "Summary sufficient",
        entities: ["Vite"],
        tags: ["Vite"],
        obsidian_links: ["Vite"],
      },
    ],
    action_items: [],
    related_notes: [],
  };

  const saved = await obsidianService.saveIssueNote(vaultPath, payload);
  assert.match(saved.filePath, /TWIR\/2026-04-09 - TWIR #261\.md$/);

  const content = await fs.readFile(saved.filePath, "utf8");
  assert.match(content, /# This Week in React #261/);
  assert.match(content, /\[\[Vite\]\]/);
});

test("obsidianService saves issue bundle with MOC and item files", async () => {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "twir-vault-bundle-"));
  const payload = {
    issue: 275,
    issue_title: "This Week In React #275: Next.js, TanStack RSC, React Compiler",
    date: "2026-04-01",
    source_url: "https://thisweekinreact.com/newsletter/275",
    moc_tags: ["Next.js", "TanStack RSC", "React Compiler"],
    tldr: ["Large release across React ecosystem."],
    topics: [
      {
        name: "Next.js",
        summary: "Adapters and ecosystem updates.",
        obsidian_link: "Next.js",
      },
    ],
    items: [
      {
        title: "Next.js Across Platforms: Adapters, OpenNext, and Our Commitments",
        url: "https://example.com/next",
        type: "featured",
        notes: "Detailed explanation of adapter strategy and compatibility direction.",
        takeaways: ["Adapters broaden platform support."],
        recommendation: "Read fully",
        recommendation_reason: "important platform roadmap",
        entities: ["Next.js"],
        tags: ["Next.js", "TanStack RSC"],
        obsidian_links: ["Next.js"],
      },
      {
        title: "How Does React Fiber Render Your UI",
        url: "https://example.com/fiber",
        type: "item",
        notes: "Deep dive into scheduling and fiber internals.",
        takeaways: ["Lanes prioritize concurrent updates."],
        recommendation: "Read fully",
        recommendation_reason: "great for internals understanding",
        entities: ["React Compiler"],
        tags: ["React Compiler"],
        obsidian_links: ["React Compiler"],
      },
    ],
    action_items: ["Read fiber article in full."],
    related_notes: ["This Week in React Index"],
  };

  const saved = await obsidianService.saveIssueBundle(vaultPath, payload);
  assert.match(saved.issueDir, /TWIR\/275$/);
  assert.match(saved.mocPath, /TWIR\/275\/2026-04-01-TWIR-275\.md$/);
  assert.equal(saved.itemPaths.length, 2);

  const moc = await fs.readFile(saved.mocPath, "utf8");
  assert.match(moc, /# This Week in React #275 \(MOC\)/);
  assert.match(moc, /\[\[articles\/01 - Next\.js Across Platforms Adapters, OpenNext, and Our Commitments\|Next\.js Across Platforms/);

  const item = await fs.readFile(saved.itemPaths[0], "utf8");
  assert.match(item, /\[\[2026-04-01-TWIR-275\|Index\]\]/);
  assert.match(item, /# Item 1: Next\.js Across Platforms: Adapters, OpenNext, and Our Commitments/);
  assert.match(item, /tags:\n  - "Nextjs"\n  - "TanStackRSC"/);
  assert.match(item, /Recommendation: Read fully \(important platform roadmap\)/);
});

test("obsidianService overwrite removes stale article markdown files", async () => {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "twir-vault-overwrite-"));
  const basePayload = {
    issue: 400,
    issue_title: "This Week In React #400",
    date: "2026-04-14",
    source_url: "https://thisweekinreact.com/newsletter/400",
    moc_tags: [],
    tldr: [],
    topics: [],
    action_items: [],
    related_notes: [],
  };

  const firstPayload = {
    ...basePayload,
    items: [
      {
        title: "First article",
        url: "https://example.com/first",
        type: "item",
        notes: "first",
        takeaways: [],
        recommendation: "Summary sufficient",
        entities: [],
        tags: [],
        obsidian_links: [],
      },
      {
        title: "Second article",
        url: "https://example.com/second",
        type: "item",
        notes: "second",
        takeaways: [],
        recommendation: "Summary sufficient",
        entities: [],
        tags: [],
        obsidian_links: [],
      },
    ],
  };

  await obsidianService.saveIssueBundle(vaultPath, firstPayload, { subdir: "TWIR" });
  const issueDir = path.join(vaultPath, "TWIR", "400");
  const articlesDir = path.join(issueDir, "articles");

  const secondPayload = {
    ...basePayload,
    items: [
      {
        title: "Only article after overwrite",
        url: "https://example.com/only",
        type: "item",
        notes: "only",
        takeaways: [],
        recommendation: "Summary sufficient",
        entities: [],
        tags: [],
        obsidian_links: [],
      },
    ],
  };

  await obsidianService.saveIssueBundle(vaultPath, secondPayload, {
    subdir: "TWIR",
    overwrite: true,
  });

  const files = (await fs.readdir(articlesDir)).filter((name) => name.endsWith(".md"));
  assert.equal(files.length, 1);
  assert.match(files[0], /^01 - Only article after overwrite\.md$/);
});

test("obsidianService generates issue notes from full article content without AI", async () => {
  const originalFetchExternalMarkdown = scraper.fetchExternalMarkdown;

  try {
    scraper.fetchExternalMarkdown = async () =>
      "## Heading\n\nText with ![image](https://example.com/img.png)";

    const payload = await obsidianService.generateIssueNotesFromReactSection({
      issueNumber: 300,
      title: "This Week In React #300",
      url: "https://thisweekinreact.com/newsletter/300",
      publishedDate: "2026-04-14",
      featured: {
        title: "Featured link",
        url: "https://example.com/featured",
      },
      items: [
        {
          title: "Regular link",
          url: "https://example.com/item",
        },
      ],
    });

    assert.equal(payload.issue, 300);
    assert.equal(payload.items.length, 2);
    assert.match(payload.items[0].notes, /!\[image\]\(https:\/\/example\.com\/img\.png\)/);
    assert.match(payload.items[1].notes, /^## Heading/m);
    assert.equal(payload.topics.length, 0);
    assert.equal(payload.tldr.length, 0);
  } finally {
    scraper.fetchExternalMarkdown = originalFetchExternalMarkdown;
  }
});

test("obsidianService generateIssueNotesFromReactSection filters '(AI skipped)' links", async () => {
  const originalFetchExternalMarkdown = scraper.fetchExternalMarkdown;
  let fetchCalls = 0;

  try {
    scraper.fetchExternalMarkdown = async () => {
      fetchCalls += 1;
      return "Content";
    };

    const payload = await obsidianService.generateIssueNotesFromReactSection({
      issueNumber: 301,
      title: "This Week In React #301",
      url: "https://thisweekinreact.com/newsletter/301",
      publishedDate: "2026-04-14",
      featured: {
        title: "Featured should stay",
        url: "https://example.com/featured",
      },
      items: [
        {
          title: "Included item",
          url: "https://example.com/included",
        },
        {
          title: "Skip me (AI skipped)",
          url: "https://example.com/skipped",
        },
      ],
    });

    assert.equal(fetchCalls, 2);
    assert.equal(payload.items.length, 2);
    assert.equal(payload.items.some((item) => item.url === "https://example.com/skipped"), false);
  } finally {
    scraper.fetchExternalMarkdown = originalFetchExternalMarkdown;
  }
});

test("obsidianService item markdown includes summary, why-it-matters, full content and notes", () => {
  const payload = {
    issue: 260,
    issue_title: "This Week In React #260: React Compiler, Vite",
    date: "2026-04-02",
    source_url: "https://thisweekinreact.com/newsletter/260",
    moc_tags: ["React Compiler"],
    tldr: [],
    topics: [],
    items: [
      {
        title: "Omit for Discriminated Unions in TypeScript",
        url: "https://example.com/article",
        type: "item",
        notes: "Short summary text.",
        takeaways: ["Takeaway 1", "Takeaway 2"],
        recommendation: "Read fully",
        recommendation_reason: "important for TS-heavy codebases",
        why_it_matters: "Helps keep union modeling type-safe and maintainable.",
        full_content: "Full cleaned article body",
        extraction_notes: "Minor sections removed during cleanup.",
        quality: "keep",
        entities: [],
        tags: ["React", "TypeScript"],
        obsidian_links: [],
      },
    ],
    action_items: [],
    related_notes: [],
  };

  const markdown = obsidianService.renderIssueItemMarkdown(
    payload,
    payload.items[0],
    7,
    "2026-04-02-TWIR-260"
  );

  assert.match(markdown, /quality: keep/);
  assert.match(markdown, /Summary:\nShort summary text\./);
  assert.match(markdown, /Recommendation:\nRead fully \(important for TS-heavy codebases\)/);
  assert.match(markdown, /Why it matters:\nHelps keep union modeling type-safe and maintainable\./);
  assert.match(markdown, /Content:\nFull cleaned article body/);
  assert.match(markdown, /Notes:\nMinor sections removed during cleanup\./);
});
