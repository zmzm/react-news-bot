const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const TurndownService = require("turndown");
const { gfm } = require("turndown-plugin-gfm");
const { HTTP_TIMEOUT, MAX_RESPONSE_SIZE } = require("../config/constants");
const {
  validateArticleUrl,
  validateNestedUrl,
  assertExternalUrlResolvesPublicly,
} = require("../utils/urlValidator");
const { handleAxiosError, NetworkError } = require("../utils/errors");

// HTTP client configuration
const axiosConfig = {
  timeout: HTTP_TIMEOUT,
  maxContentLength: MAX_RESPONSE_SIZE,
  maxBodyLength: MAX_RESPONSE_SIZE,
  validateStatus: (status) => status >= 200 && status < 400,
};

class Scraper {
  constructor() {
    this._cache = new Map();
    this._cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  _getCached(url) {
    const entry = this._cache.get(url);
    if (entry && Date.now() - entry.timestamp < this._cacheTTL) {
      return entry.html;
    }
    this._cache.delete(url);
    return null;
  }

  _setCache(url, html) {
    this._cache.set(url, { html, timestamp: Date.now() });
    // Evict oldest entry if cache grows too large
    if (this._cache.size > 50) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
  }

  /**
   * Fetch HTML content from URL
   * @param {string} url - URL to fetch
   * @returns {Promise<cheerio.Root>} - Cheerio instance
   */
  async fetch(url) {
    try {
      const validatedUrl = validateArticleUrl(url);

      // Check cache first
      const cachedHtml = this._getCached(validatedUrl);
      if (cachedHtml) {
        return cheerio.load(cachedHtml);
      }

      const res = await axios.get(validatedUrl, axiosConfig);

      if (!res.data) {
        throw new NetworkError("Empty response from server");
      }

      // Cache the raw HTML
      this._setCache(validatedUrl, res.data);

      return cheerio.load(res.data);
    } catch (err) {
      // Convert axios errors to application errors
      if (err.response || err.code) {
        throw handleAxiosError(err, "Fetching article");
      }
      // Re-throw validation errors as-is
      if (err.code === "VALIDATION_ERROR" || err.code === "NOT_FOUND") {
        throw err;
      }
      // Wrap other errors
      throw new NetworkError(`Failed to fetch article: ${err.message}`);
    }
  }

  /**
   * Get the latest article URL from the newsletter page
   * @returns {Promise<string>} - Latest article URL
   */
  async getLatestArticleUrl() {
    const baseUrl = "https://thisweekinreact.com/newsletter";
    const validatedUrl = validateArticleUrl(baseUrl);
    const $ = await this.fetch(validatedUrl);

    // First link of the form /newsletter/261
    const link = $('a[href^="/newsletter/"]').first();
    const href = link.attr("href");
    if (!href) {
      throw new Error("Failed to find link to the latest article");
    }

    const absoluteUrl = new URL(href, validatedUrl).toString();
    return validateArticleUrl(absoluteUrl);
  }

  /**
   * Build article URL from article number
   * @param {number} articleNumber - The article number
   * @returns {string} - The validated article URL
   */
  getArticleUrl(articleNumber) {
    if (!Number.isInteger(articleNumber) || articleNumber < 1) {
      throw new Error(`Invalid article number: ${articleNumber}`);
    }

    const baseUrl = `https://thisweekinreact.com/newsletter/${articleNumber}`;
    return validateArticleUrl(baseUrl);
  }

  /**
   * Fetch HTML content from external URL (for nested links)
   * @param {string} url - External URL to fetch
   * @returns {Promise<cheerio.Root>} - Cheerio instance
   */
  async fetchExternal(url) {
    try {
      const result = await this._fetchExternalHtml(url);
      return cheerio.load(result.html);
    } catch (err) {
      // Convert axios errors to application errors
      if (err.response || err.code) {
        throw handleAxiosError(err, "Fetching external article");
      }
      // Re-throw validation errors as-is
      if (err.code === "VALIDATION_ERROR" || err.code === "NOT_FOUND") {
        throw err;
      }
      // Wrap other errors
      throw new NetworkError(
        `Failed to fetch external article: ${err.message}`
      );
    }
  }

  /**
   * Fetch markdown-ready content from external URL using readability + turndown.
   * @param {string} url
   * @returns {Promise<string>}
   */
  async fetchExternalMarkdown(url) {
    const validatedUrl = validateNestedUrl(url);
    await assertExternalUrlResolvesPublicly(validatedUrl);
    const mode = this._getObsidianScraperMode();

    if (mode === "python" || mode === "hybrid") {
      try {
        return await this._fetchExternalMarkdownWithPython(validatedUrl);
      } catch (err) {
        if (mode === "python") {
          throw new NetworkError(
            `Python clipper failed: ${err.message}. Install deps: pip3 install requests readability-lxml markdownify beautifulsoup4 lxml`
          );
        }
      }
    }

    if (mode === "playwright" || mode === "hybrid") {
      try {
        return await this._fetchExternalMarkdownWithPlaywright(validatedUrl);
      } catch (err) {
        if (mode === "playwright") {
          throw new NetworkError(
            `Playwright clipper failed: ${err.message}. Install browser runtime with: npx playwright install chromium`
          );
        }
      }
    }

    const { html, finalUrl } = await this._fetchExternalHtml(validatedUrl);
    return this._extractMarkdownWithReadability(html, finalUrl);
  }

  /**
   * Extract readable text content from an article page
   * Attempts to find main content by common selectors
   * @param {cheerio.Root} $ - Cheerio instance
   * @returns {string} - Extracted text content
   */
  extractArticleContent($) {
    // Remove script, style, nav, header, footer, aside elements
    $(
      "script, style, nav, header, footer, aside, .advertisement, .ad, .sidebar"
    ).remove();

    // Try common article content selectors
    const contentSelectors = [
      "article",
      '[role="main"]',
      ".content",
      ".post-content",
      ".article-content",
      ".entry-content",
      "main",
      ".main-content",
    ];

    let content = null;
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length) {
        content = element;
        break;
      }
    }

    // Fallback to body if no specific content area found
    if (!content) {
      content = $("body");
    }

    // Extract text, preserving some structure
    let text = content
      .find("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, code")
      .map((_, el) => {
        const $el = $(el);
        const tagName = el.tagName.toLowerCase();
        const elText = $el.text().trim();

        if (!elText) return "";

        // Add spacing for headings
        if (tagName.startsWith("h")) {
          return `\n\n${elText}\n`;
        }

        // Code blocks
        if (tagName === "pre" || tagName === "code") {
          return `\n${elText}\n`;
        }

        return elText;
      })
      .get()
      .join("\n")
      .replace(/\n{3,}/g, "\n\n") // Normalize multiple newlines
      .trim();

    // If we got very little content, try getting all text from body
    if (text.length < 200) {
      text = $("body").text().replace(/\s+/g, " ").trim();
    }

    // Limit content length to avoid token limits (keep first 8000 chars)
    if (text.length > 8000) {
      text = text.substring(0, 8000) + "\n\n... (content truncated)";
    }

    return text || "Unable to extract content from this article.";
  }

  /**
   * Extract markdown content from article page, preserving structure and images.
   * @param {cheerio.Root} $ - Cheerio instance
   * @param {string} pageUrl - Source page URL (for resolving relative links/images)
   * @returns {string}
   */
  extractArticleMarkdown($, pageUrl = "") {
    // Keep previous heuristic extractor as fallback path.
    $(
      "script, style, nav, header, footer, aside, .advertisement, .ad, .sidebar, noscript, iframe"
    ).remove();

    const contentSelectors = [
      "article",
      '[role="main"]',
      ".content",
      ".post-content",
      ".article-content",
      ".entry-content",
      "main",
      ".main-content",
    ];

    let content = null;
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length) {
        content = element;
        break;
      }
    }

    if (!content) {
      content = $("body");
    }

    const lines = [];
    content.contents().each((_, node) => {
      const block = this._nodeToMarkdown($, node, pageUrl, 0).trim();
      if (block) {
        lines.push(block);
      }
    });

    let markdown = lines.join("\n\n");
    markdown = markdown
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();

    if (markdown.length < 200) {
      const fallbackText = this.extractArticleContent($);
      markdown = fallbackText;
    }

    if (markdown.length > 30000) {
      markdown = `${markdown.substring(0, 30000)}\n\n... (content truncated)`;
    }

    return markdown || "Unable to extract content from this article.";
  }

  async _fetchExternalHtml(url) {
    try {
      const validatedUrl = validateNestedUrl(url);
      await assertExternalUrlResolvesPublicly(validatedUrl);

      const res = await axios.get(validatedUrl, {
        ...axiosConfig,
        timeout: HTTP_TIMEOUT * 2,
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ThisWeekInReactBot/1.0)",
        },
      });

      if (!res.data) {
        throw new NetworkError("Empty response from server");
      }

      const finalUrl =
        res.request?.res?.responseUrl ||
        res.request?.responseURL ||
        validatedUrl;
      const validatedFinalUrl = validateNestedUrl(finalUrl);
      await assertExternalUrlResolvesPublicly(validatedFinalUrl);

      return { html: res.data, finalUrl: validatedFinalUrl };
    } catch (err) {
      if (err.response || err.code) {
        throw handleAxiosError(err, "Fetching external article");
      }
      if (err.code === "VALIDATION_ERROR" || err.code === "NOT_FOUND") {
        throw err;
      }
      throw new NetworkError(`Failed to fetch external article: ${err.message}`);
    }
  }

  _extractMarkdownWithReadability(html, pageUrl) {
    try {
      // Lazy-load because jsdom/readability can be incompatible with Bun runtime.
      // Fallback to heuristic extractor if unavailable.
      const { JSDOM } = require("jsdom");
      const { Readability } = require("@mozilla/readability");
      const dom = new JSDOM(html, { url: pageUrl });
      const readability = new Readability(dom.window.document, {
        charThreshold: 200,
      });
      const article = readability.parse();
      const contentHtml =
        (article && typeof article.content === "string" && article.content) ||
        dom.window.document.body?.innerHTML ||
        "";

      const markdownBody = this._htmlToMarkdown(contentHtml, pageUrl);
      const title = article?.title ? String(article.title).trim() : "";
      const heading = title ? `# ${title}\n\n` : "";
      const markdown = `${heading}${markdownBody}`.trim();

      if (markdown.length < 200) {
        return this._extractMarkdownWithHeuristics(html, pageUrl);
      }

      if (markdown.length > 30000) {
        return `${markdown.substring(0, 30000)}\n\n... (content truncated)`;
      }

      return markdown;
    } catch {
      return this._extractMarkdownWithHeuristics(html, pageUrl);
    }
  }

  _extractMarkdownWithHeuristics(html, pageUrl) {
    const $ = cheerio.load(html);

    $(
      "script, style, noscript, iframe, nav, header, footer, aside, .advertisement, .ad, .sidebar"
    ).remove();

    // Remove common non-article blocks seen on blogs/newsletters.
    const junkPatterns = [
      "subscribe",
      "newsletter",
      "share",
      "related",
      "read more",
      "join the discussion",
      "copy link",
      "hacker news",
      "lobste.rs",
      "reddit",
      "dev.to",
      "medium",
      "satisfaction guaranteed",
    ];
    $("section, div, aside, form").each((_, el) => {
      const text = $(el).text().slice(0, 500).toLowerCase();
      if (junkPatterns.some((pattern) => text.includes(pattern))) {
        $(el).remove();
      }
    });

    const contentSelectors = [
      "article",
      "main article",
      "[role='main'] article",
      "[role='main']",
      "main",
      ".post-content",
      ".article-content",
      ".entry-content",
      ".content",
      ".main-content",
      ".blog-post",
      ".post",
    ];

    let content = null;
    for (const selector of contentSelectors) {
      const el = $(selector).first();
      if (el.length && el.text().trim().length > 300) {
        content = el;
        break;
      }
    }

    if (!content) {
      // Fallback: choose the largest text block among generic containers.
      let best = null;
      let bestLen = 0;
      $("article, main, section, div").each((_, el) => {
        const len = $(el).text().trim().length;
        if (len > bestLen) {
          best = $(el);
          bestLen = len;
        }
      });
      content = best || $("body");
    }

    const title =
      $("h1").first().text().trim() ||
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("title").first().text().trim() ||
      "";

    const bodyHtml = content.html() || "";
    let markdown = this._htmlToMarkdown(bodyHtml, pageUrl);
    if (title && !markdown.startsWith(`# ${title}`)) {
      markdown = `# ${title}\n\n${markdown}`;
    }

    markdown = this._postCleanMarkdown(markdown);
    if (markdown.length > 30000) {
      markdown = `${markdown.substring(0, 30000)}\n\n... (content truncated)`;
    }

    if (markdown.length < 200) {
      // Last-resort fallback for very hostile pages.
      const text = this.extractArticleContent($);
      return this._postCleanMarkdown(text);
    }

    return markdown;
  }

  _htmlToMarkdown(html, pageUrl) {
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
    });
    turndownService.use(gfm);

    turndownService.addRule("absolute-links", {
      filter: "a",
      replacement: (content, node) => {
        const href = this._resolveUrl(node.getAttribute("href"), pageUrl);
        const text = (content || "").trim() || href;
        const isAnchorOnly =
          href &&
          ((pageUrl && href.startsWith(`${pageUrl}#`)) || href.startsWith("#"));
        const looksUtilityAnchor =
          isAnchorOnly &&
          (!content.trim() || /^https?:\/\//i.test(text) || text === href);
        if (looksUtilityAnchor) {
          return "";
        }
        return href ? `[${text}](${href})` : text;
      },
    });

    turndownService.addRule("absolute-images", {
      filter: "img",
      replacement: (_, node) => {
        const src = this._resolveUrl(node.getAttribute("src"), pageUrl);
        if (!src) return "";
        const alt = (node.getAttribute("alt") || "image").trim();
        const width = Number(node.getAttribute("width") || 0);
        const height = Number(node.getAttribute("height") || 0);
        const looksDecorativeAnchor =
          /^https?:\/\//i.test(alt) ||
          src.includes("#") ||
          /icon|sprite|logo/i.test(src) ||
          (width > 0 && width <= 24 && height > 0 && height <= 24);
        if (looksDecorativeAnchor) {
          return "";
        }
        return `![${alt}](${src})`;
      },
    });

    return turndownService
      .turndown(html || "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  _postCleanMarkdown(markdown) {
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
    const firstHeading =
      lines.find((line) => line.trim().startsWith("# "))?.trim() || "";
    let seenFirstHeading = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && dropPatterns.some((re) => re.test(trimmed))) {
        continue;
      }
      if (firstHeading && trimmed === firstHeading) {
        if (seenFirstHeading) {
          continue;
        }
        seenFirstHeading = true;
      }
      kept.push(line);
    }

    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  _getObsidianScraperMode() {
    const raw = String(process.env.OBSIDIAN_SCRAPER_MODE || "hybrid")
      .trim()
      .toLowerCase();
    if (raw === "python" || raw === "playwright" || raw === "hybrid" || raw === "fast") {
      return raw;
    }
    return "hybrid";
  }

  async _fetchExternalMarkdownWithPython(validatedUrl) {
    const workerPath = path.join(__dirname, "..", "scripts", "python-clipper.py");
    const defaultVenvPython = path.join(__dirname, "..", ".venv", "bin", "python");
    const pythonBinary =
      process.env.PYTHON_CLIPPER_BINARY ||
      (fs.existsSync(defaultVenvPython) ? defaultVenvPython : "python3");

    const output = await new Promise((resolve, reject) => {
      execFile(
        pythonBinary,
        [workerPath, validatedUrl],
        {
          timeout: 65000,
          maxBuffer: 1024 * 1024 * 4,
          env: process.env,
        },
        (err, stdout, stderr) => {
          if (err) {
            let workerError = "";
            try {
              const parsed = JSON.parse(String(stdout || "").trim() || "{}");
              workerError = parsed?.error || "";
            } catch {
              workerError = "";
            }

            const details = workerError
              ? workerError
              : stderr
                ? `${err.message} | ${stderr}`
                : err.message;
            reject(new Error(details));
            return;
          }
          resolve(stdout);
        }
      );
    });

    let parsed;
    try {
      parsed = JSON.parse(String(output || "").trim() || "{}");
    } catch {
      throw new Error("Invalid response from python clipper worker");
    }

    if (!parsed.ok) {
      throw new Error(parsed.error || "Python clipper worker failed");
    }

    const markdown = typeof parsed.markdown === "string" ? parsed.markdown.trim() : "";
    if (!markdown) {
      throw new Error("Python clipper returned empty markdown");
    }
    return markdown;
  }

  async _fetchExternalMarkdownWithPlaywright(validatedUrl) {
    const workerPath = path.join(__dirname, "..", "scripts", "playwright-clipper.js");
    const nodeBinary = process.env.PLAYWRIGHT_NODE_BINARY || "node";

    const output = await new Promise((resolve, reject) => {
      execFile(
        nodeBinary,
        [workerPath, validatedUrl],
        {
          timeout: 65000,
          maxBuffer: 1024 * 1024 * 4,
          env: process.env,
        },
        (err, stdout, stderr) => {
          if (err) {
            let workerError = "";
            try {
              const parsed = JSON.parse(String(stdout || "").trim() || "{}");
              workerError = parsed?.error || "";
            } catch {
              workerError = "";
            }

            const details = workerError
              ? workerError
              : stderr
                ? `${err.message} | ${stderr}`
                : err.message;
            reject(new Error(details));
            return;
          }
          resolve(stdout);
        }
      );
    });

    let parsed;
    try {
      parsed = JSON.parse(String(output || "").trim() || "{}");
    } catch {
      throw new Error("Invalid response from playwright clipper worker");
    }

    if (!parsed.ok) {
      throw new Error(parsed.error || "Playwright clipper worker failed");
    }

    const markdown = typeof parsed.markdown === "string" ? parsed.markdown.trim() : "";
    if (!markdown) {
      throw new Error("Playwright clipper returned empty markdown");
    }
    return markdown;
  }

  _nodeToMarkdown($, node, pageUrl, depth = 0) {
    if (!node) return "";
    if (node.type === "text") {
      return (node.data || "").replace(/\s+/g, " ");
    }
    if (node.type !== "tag") return "";

    const tag = (node.tagName || "").toLowerCase();
    const $node = $(node);
    const childrenInline = this._childrenToInlineMarkdown($, node, pageUrl, depth).trim();

    if (tag === "h1") return `# ${childrenInline}`;
    if (tag === "h2") return `## ${childrenInline}`;
    if (tag === "h3") return `### ${childrenInline}`;
    if (tag === "h4") return `#### ${childrenInline}`;
    if (tag === "h5") return `##### ${childrenInline}`;
    if (tag === "h6") return `###### ${childrenInline}`;
    if (tag === "p") return childrenInline;
    if (tag === "br") return "  \n";
    if (tag === "hr") return "---";

    if (tag === "pre") {
      const raw = $node.text().trim();
      return raw ? `\`\`\`\n${raw}\n\`\`\`` : "";
    }

    if (tag === "blockquote") {
      const inner = this._childrenToBlockMarkdown($, node, pageUrl, depth)
        .split("\n")
        .map((line) => (line.trim() ? `> ${line}` : ">"))
        .join("\n");
      return inner.trim();
    }

    if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      const items = [];
      $node.children("li").each((idx, li) => {
        const prefix = ordered ? `${idx + 1}. ` : "- ";
        const liMd = this._listItemToMarkdown($, li, pageUrl, depth + 1);
        if (!liMd) return;
        const indented = liMd.split("\n");
        const head = `${prefix}${indented[0]}`;
        const tail = indented
          .slice(1)
          .map((line) => (line ? `  ${line}` : ""))
          .join("\n");
        items.push(tail ? `${head}\n${tail}` : head);
      });
      return items.join("\n");
    }

    if (tag === "img") {
      const src = this._resolveUrl($node.attr("src"), pageUrl);
      if (!src) return "";
      const alt = ($node.attr("alt") || "image").trim();
      return `![${alt}](${src})`;
    }

    if (["section", "article", "main", "div"].includes(tag)) {
      return this._childrenToBlockMarkdown($, node, pageUrl, depth);
    }

    return childrenInline;
  }

  _listItemToMarkdown($, liNode, pageUrl, depth) {
    const $li = $(liNode);
    const parts = [];
    const nestedLists = [];

    $li.contents().each((_, child) => {
      if (child.type === "tag") {
        const tag = (child.tagName || "").toLowerCase();
        if (tag === "ul" || tag === "ol") {
          const nested = this._nodeToMarkdown($, child, pageUrl, depth + 1).trim();
          if (nested) nestedLists.push(nested);
          return;
        }
      }
      const chunk = this._nodeToInlineMarkdown($, child, pageUrl, depth);
      if (chunk) parts.push(chunk);
    });

    const text = parts.join("").replace(/\s+/g, " ").trim();
    if (nestedLists.length === 0) {
      return text;
    }

    const nested = nestedLists
      .map((block) =>
        block
          .split("\n")
          .map((line) => (line ? `  ${line}` : ""))
          .join("\n")
      )
      .join("\n");

    return text ? `${text}\n${nested}` : nested;
  }

  _childrenToBlockMarkdown($, node, pageUrl, depth) {
    const parts = [];
    $(node)
      .contents()
      .each((_, child) => {
        const chunk = this._nodeToMarkdown($, child, pageUrl, depth);
        if (chunk && chunk.trim()) {
          parts.push(chunk.trim());
        }
      });
    return parts.join("\n\n").trim();
  }

  _childrenToInlineMarkdown($, node, pageUrl, depth) {
    const parts = [];
    $(node)
      .contents()
      .each((_, child) => {
        const chunk = this._nodeToInlineMarkdown($, child, pageUrl, depth);
        if (chunk) parts.push(chunk);
      });
    return parts.join("").replace(/\s+/g, " ").trim();
  }

  _nodeToInlineMarkdown($, node, pageUrl, depth = 0) {
    if (!node) return "";
    if (node.type === "text") {
      return (node.data || "").replace(/\s+/g, " ");
    }
    if (node.type !== "tag") return "";

    const tag = (node.tagName || "").toLowerCase();
    const $node = $(node);
    const inner = this._childrenToInlineMarkdown($, node, pageUrl, depth);

    if (tag === "a") {
      const href = this._resolveUrl($node.attr("href"), pageUrl);
      if (!href) return inner;
      return `[${inner || href}](${href})`;
    }
    if (tag === "strong" || tag === "b") return inner ? `**${inner}**` : "";
    if (tag === "em" || tag === "i") return inner ? `*${inner}*` : "";
    if (tag === "code") return inner ? `\`${inner}\`` : "";
    if (tag === "br") return "  \n";
    if (tag === "img") {
      const src = this._resolveUrl($node.attr("src"), pageUrl);
      if (!src) return "";
      const alt = ($node.attr("alt") || "image").trim();
      return `![${alt}](${src})`;
    }

    return inner;
  }

  _resolveUrl(value, pageUrl) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    if (raw.startsWith("data:")) return raw;

    try {
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return raw;
      }
      if (!pageUrl) return "";
      return new URL(raw, pageUrl).toString();
    } catch {
      return "";
    }
  }
}

module.exports = new Scraper();
