#!/usr/bin/env node

const { chromium } = require("playwright");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const TurndownService = require("turndown");
const { gfm } = require("turndown-plugin-gfm");

function resolveUrl(raw, baseUrl) {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) return "";
  if (input.startsWith("data:")) return input;

  try {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return input;
    }
    if (!baseUrl) return "";
    return new URL(input, baseUrl).toString();
  } catch {
    return "";
  }
}

function htmlToMarkdown(html, pageUrl) {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });
  service.use(gfm);

  service.addRule("absolute-links", {
    filter: "a",
    replacement: (content, node) => {
      const href = resolveUrl(node.getAttribute("href"), pageUrl);
      const text = (content || "").trim() || href;
      return href ? `[${text}](${href})` : text;
    },
  });

  service.addRule("absolute-images", {
    filter: "img",
    replacement: (_, node) => {
      const src = resolveUrl(node.getAttribute("src"), pageUrl);
      if (!src) return "";
      const alt = (node.getAttribute("alt") || "image").trim();
      return `![${alt}](${src})`;
    },
  });

  return service
    .turndown(html || "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function postCleanMarkdown(markdown) {
  const lines = String(markdown || "").split("\n");
  const dropPatterns = [
    /related posts?/i,
    /share this post/i,
    /join the discussion/i,
    /subscribe/i,
    /copy link/i,
    /hacker news/i,
    /lobste\.rs/i,
    /reddit/i,
    /dev\.to/i,
    /medium/i,
    /read more\s*→?/i,
    /satisfaction guaranteed/i,
  ];

  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && dropPatterns.some((re) => re.test(trimmed))) {
      continue;
    }
    kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    throw new Error("URL argument is required");
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 900 },
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    const finalUrl = page.url();
    const html = await page.content();
    const dom = new JSDOM(html, { url: finalUrl });
    const reader = new Readability(dom.window.document, { charThreshold: 200 });
    const article = reader.parse();

    const contentHtml =
      (article && typeof article.content === "string" && article.content) ||
      dom.window.document.body?.innerHTML ||
      "";
    const title = article?.title ? String(article.title).trim() : "";

    let markdown = htmlToMarkdown(contentHtml, finalUrl);
    if (title && !markdown.startsWith(`# ${title}`)) {
      markdown = `# ${title}\n\n${markdown}`;
    }
    markdown = postCleanMarkdown(markdown);

    if (markdown.length > 30000) {
      markdown = `${markdown.substring(0, 30000)}\n\n... (content truncated)`;
    }

    process.stdout.write(
      JSON.stringify({
        ok: true,
        markdown: markdown || "Unable to extract content from this article.",
        finalUrl,
      })
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: err?.message || "Unknown clipper error",
    })
  );
  process.exit(1);
});

