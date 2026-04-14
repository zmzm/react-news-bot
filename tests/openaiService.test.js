const test = require("node:test");
const assert = require("node:assert/strict");

const openaiService = require("../services/openaiService");

test("extractItemTags derives specific tags from article title", () => {
  const item = {
    title: "Next.js Across Platforms: Adapters, OpenNext, and Our Commitments",
    summary: "Detailed explanation of adapter strategy and compatibility direction.",
    takeaways: ["Adapters broaden platform support."],
    obsidianLinks: ["Next.js"],
  };

  const tags = openaiService._extractItemTags(item, [
    "Next.js",
    "TanStack RSC",
    "React Compiler",
  ]);

  assert.ok(tags.includes("Next.js"));
  assert.ok(tags.includes("OpenNext"));
  assert.ok(!tags.includes("AI"));
});

test("extractItemTags avoids generic title words", () => {
  const item = {
    title: "TanStack Router's New Reactive Core: A Signal Graph",
    summary: "Introduces a new reactive core for routing internals.",
    takeaways: ["Signal graph drives updates."],
    obsidianLinks: [],
  };

  const tags = openaiService._extractItemTags(item, ["TanStack RSC"]);

  assert.ok(tags.includes("TanStack"));
  assert.ok(tags.includes("TanStackRouter"));
  assert.ok(!tags.includes("New"));
  assert.ok(!tags.includes("Reactive"));
  assert.ok(!tags.includes("Core"));
  assert.ok(!tags.includes("Signal"));
  assert.ok(!tags.includes("Graph"));
});

test("buildIssueLinks normalizes urls and drops invalid entries", () => {
  const links = openaiService._buildIssueLinks({
    featured: {
      title: "Featured story",
      url: "http://example.com/featured",
    },
    items: [
      {
        title: "https://example.com/swapped",
        url: "Swapped title",
      },
      {
        title: "Bad item",
        url: "The Incredible Overcomplexity of the Shadcn Radio Button",
      },
    ],
  });

  assert.equal(links.length, 2);
  assert.equal(links[0].type, "featured");
  assert.equal(links[0].url, "https://example.com/featured");
  assert.equal(links[1].title, "Swapped title");
  assert.equal(links[1].url, "https://example.com/swapped");
});

test("mergeFetchedContentIntoIssueNotes prefers full fetched article text", () => {
  const payload = {
    items: [
      {
        title: "Article A",
        url: "http://example.com/a",
        notes: "AI summary A",
      },
      {
        title: "Article B",
        url: "https://example.com/b",
        notes: "AI summary B",
      },
    ],
  };

  const merged = openaiService._mergeFetchedContentIntoIssueNotes(payload, [
    {
      url: "https://example.com/a",
      content: "Full content A",
      success: true,
    },
    {
      url: "https://example.com/b",
      content: "Fetch failed",
      success: false,
    },
  ]);

  assert.equal(merged.items[0].notes, "Full content A");
  assert.equal(merged.items[1].notes, "AI summary B");
});
