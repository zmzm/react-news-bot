const {
  validateArticleUrl,
  validateNestedUrl,
} = require("../utils/urlValidator");
const {
  MAX_TITLE_LENGTH,
  MAX_MESSAGE_LENGTH,
  ARTICLES_TO_SKIP,
  ARTICLES_TO_SKIP_AI,
} = require("../config/constants");
const scraper = require("./scraper");
const { logInfo, logError } = require("../utils/logger");
const observability = require("./observabilityService");
const {
  ParsingError,
  NotFoundError,
  ValidationError,
  NetworkError,
} = require("../utils/errors");

class ArticleService {
  /**
   * Parse the React section from a specific article URL
   * @param {string} articleUrl - URL of the article
   * @returns {Promise<string>} - Formatted text for Telegram
   */
  async getReactSectionText(articleUrl) {
    const validatedUrl = validateArticleUrl(articleUrl);
    const $ = await scraper.fetch(validatedUrl);

    const parsed = this._parseReactSectionFromDom($, validatedUrl);
    return this._formatMessage(
      parsed.title,
      parsed.url,
      parsed.featured,
      parsed.items
    );
  }

  /**
   * Find React section heading using multiple strategies
   * @private
   */
  _findReactSection($) {
    const allHeadings = [];
    $("h1, h2, h3").each((_, el) => {
      allHeadings.push({
        el: $(el),
        tag: (el.tagName || "").toLowerCase(),
        text: $(el).text().toLowerCase(),
        html: $(el).html() || "",
      });
    });

    // Strategy 1: h2 with "react" text (not "react-native")
    for (const h of allHeadings) {
      if (
        h.tag === "h2" &&
        h.text.includes("react") &&
        !h.text.includes("react-native")
      ) {
        logInfo("Found React section using Strategy 1 (h2 with 'React')");
        return h.el;
      }
    }

    // Strategy 2: h2 with emoji
    for (const h of allHeadings) {
      if (h.tag === "h2" && (h.html.includes("⚛️") || h.html.includes("React"))) {
        logInfo("Found React section using Strategy 2 (h2 with emoji)");
        return h.el;
      }
    }

    // Strategy 3: any heading with "react"
    for (const h of allHeadings) {
      if (h.text.includes("react") && !h.text.includes("react-native")) {
        logInfo("Found React section using Strategy 3 (any heading with 'React')");
        return h.el;
      }
    }

    logInfo(`Available headings: ${allHeadings.map((h) => h.text).join(", ")}`);
    return $(); // empty Cheerio object
  }

  /**
   * Check if article is special non-newsletter content
   * @private
   */
  _isSpecialArticle($) {
    const allHeadings = $("h1, h2, h3")
      .map((_, el) => $(el).text().trim().toLowerCase())
      .get();

    return allHeadings.some(
      (h) =>
        h.includes("announcement") ||
        h.includes("launch") ||
        h.includes("special")
    );
  }

  /**
   * Validate that React section exists and return heading
   * @private
   */
  _ensureReactHeading($) {
    const reactHeading = this._findReactSection($);

    if (reactHeading && reactHeading.length) {
      return reactHeading;
    }

    if (this._isSpecialArticle($)) {
      throw new ParsingError(
        "This article is a special announcement and doesn't contain a React section. " +
          "It may be about a launch, update, or other special content."
      );
    }

    throw new ParsingError(
      "React section not found in the article. " +
        "This article might have a different structure or may not contain React-related content."
    );
  }

  /**
   * Collect section nodes from heading until next major section heading
   * @private
   */
  _getSectionNodes(reactHeading) {
    const nodes = [];
    let current = reactHeading.next();
    let iterations = 0;
    const maxIterations = 200;

    while (current.length && iterations < maxIterations) {
      iterations += 1;
      const tag = (current[0]?.tagName || "").toLowerCase();

      // Stop at next major section.
      if (tag === "h1" || tag === "h2") {
        break;
      }

      nodes.push(current);
      current = current.next();
    }

    return nodes;
  }

  /**
   * Extract featured article from section nodes
   * @private
   */
  _extractFeatured($, reactHeading, baseUrl) {
    const sectionNodes = this._getSectionNodes(reactHeading);

    for (const node of sectionNodes) {
      const featuredLink = node.is("a") ? node : node.find("a").first();
      if (!featuredLink || !featuredLink.length) {
        continue;
      }

      const item = this._normalizeItemFromLink($, featuredLink, baseUrl);
      if (item) {
        return {
          title: item.title,
          url: item.url,
        };
      }
    }

    return null;
  }

  /**
   * Extract links from list nodes and return normalized items
   * @private
   */
  _extractLinksFromList($, listNode, baseUrl) {
    const items = [];

    listNode.find("li").each((_, li) => {
      const $li = $(li);

      // Skip items marked with blocked emojis
      if (ARTICLES_TO_SKIP.some((text) => $li.text().includes(text))) {
        return;
      }

      const $a = this._findPrimaryLinkInListItem($, $li);
      if (!$a || !$a.length) {
        return;
      }

      const item = this._normalizeItemFromLink($, $a, baseUrl, $li.text());
      if (item) {
        items.push(item);
      }
    });

    return items;
  }

  /**
   * Pick the primary article link from a newsletter list item.
   * TWIR often includes secondary inline links like "docs" or "React.FC".
   * @private
   */
  _findPrimaryLinkInListItem($, $li) {
    const anchors = $li.find("a").toArray();
    if (anchors.length === 0) return null;

    let best = null;
    let bestScore = -1;

    for (const anchor of anchors) {
      const $anchor = $(anchor);
      const text = $anchor.text().trim();
      const href = $anchor.attr("href");
      if (!text || !href) continue;

      const score = text.length;
      if (score > bestScore) {
        best = $anchor;
        bestScore = score;
      }
    }

    return best;
  }

  /**
   * Normalize and validate extracted link
   * @private
   */
  _normalizeItemFromLink($, $a, baseUrl, contextText = "") {
    const title = $a.text().trim();
    if (!title) return null;

    let url = $a.attr("href");
    if (!url) return null;

    if (!url.startsWith("http")) {
      url = new URL(url, baseUrl).toString();
    }

    try {
      const validatedItemUrl = validateNestedUrl(url);
      const aiSkip = ARTICLES_TO_SKIP_AI.some((text) =>
        contextText.includes(text)
      );
      const truncatedTitle = title.substring(0, MAX_TITLE_LENGTH);

      return {
        title: aiSkip ? `${truncatedTitle} (AI skipped)` : truncatedTitle,
        url: validatedItemUrl,
      };
    } catch (err) {
      logInfo(`Skipping invalid URL: ${url} - ${err.message}`);
      return null;
    }
  }

  /**
   * Extract list items from React section
   * @private
   */
  _extractItems($, reactHeading, baseUrl) {
    const sectionNodes = this._getSectionNodes(reactHeading);
    const seenUrls = new Set();
    const items = [];

    for (const node of sectionNodes) {
      const tag = (node[0]?.tagName || "").toLowerCase();
      if (tag !== "ul" && tag !== "ol") {
        continue;
      }

      const extracted = this._extractLinksFromList($, node, baseUrl);
      for (const item of extracted) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Parse React section from already-loaded DOM
   * @private
   */
  _parseReactSectionFromDom($, validatedUrl) {
    observability.incParseAttempt();
    const title = $("h1").first().text().trim() || "This Week In React";
    const publishedDate = this._extractPublishedDate($);
    const reactHeading = this._ensureReactHeading($);
    const featured = this._extractFeatured($, reactHeading, validatedUrl);
    const items = this._extractItems($, reactHeading, validatedUrl);
    observability.incParseSuccess();

    return {
      title,
      url: validatedUrl,
      publishedDate,
      featured,
      items,
    };
  }

  /**
   * Extract article publish date as YYYY-MM-DD.
   * Priority: <time datetime> -> meta article:published_time -> JSON-LD datePublished
   * @private
   */
  _extractPublishedDate($) {
    const toIsoDate = (value) => {
      if (!value || typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const date = new Date(trimmed);
      if (Number.isNaN(date.getTime())) return null;
      return date.toISOString().slice(0, 10);
    };

    const fromTime = toIsoDate($("time[datetime]").first().attr("datetime"));
    if (fromTime) return fromTime;

    const fromMeta = toIsoDate(
      $('meta[property="article:published_time"]').attr("content")
    );
    if (fromMeta) return fromMeta;

    let fromJsonLd = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (fromJsonLd) return;
      try {
        const raw = $(el).html();
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            const extracted = toIsoDate(entry?.datePublished);
            if (extracted) {
              fromJsonLd = extracted;
              return;
            }
          }
          return;
        }
        fromJsonLd = toIsoDate(parsed?.datePublished);
      } catch {
        // ignore invalid JSON-LD blocks
      }
    });

    if (fromJsonLd) return fromJsonLd;
    return null;
  }

  /**
   * Fetch and parse issue by number
   * @private
   */
  async _fetchIssueData(articleNumber) {
    const articleUrl = scraper.getArticleUrl(articleNumber);
    logInfo(`Fetching article #${articleNumber} from ${articleUrl}`);

    const validatedUrl = validateArticleUrl(articleUrl);
    const $ = await scraper.fetch(validatedUrl);
    const parsed = this._parseReactSectionFromDom($, validatedUrl);

    return {
      issueNumber: articleNumber,
      ...parsed,
    };
  }

  /**
   * Format and rethrow lower-level errors as domain errors
   * @private
   */
  _mapToDomainError(err, articleNumber, includeCauseMessage = true) {
    if (
      err instanceof ParsingError ||
      err instanceof NotFoundError ||
      err instanceof ValidationError ||
      err instanceof NetworkError
    ) {
      throw err;
    }

    if (err.response) {
      const status = err.response.status;
      if (status === 404) {
        throw new NotFoundError(`Article #${articleNumber} not found (404)`);
      }
      throw new NetworkError(
        `HTTP ${status} error fetching article #${articleNumber}${
          includeCauseMessage ? `: ${err.message}` : ""
        }`,
        "HTTP_ERROR",
        status
      );
    }

    if (
      err.code === "ECONNREFUSED" ||
      err.code === "ETIMEDOUT" ||
      err.code === "ENOTFOUND"
    ) {
      throw new NetworkError(
        `Network error fetching article #${articleNumber}${
          includeCauseMessage ? `: ${err.message}` : ""
        }`,
        err.code
      );
    }

    if (
      typeof err.message === "string" &&
      (err.message.includes("Invalid URL") || err.message.includes("not allowed"))
    ) {
      throw new ValidationError(
        `Invalid URL for article #${articleNumber}${
          includeCauseMessage ? `: ${err.message}` : ""
        }`
      );
    }

    logError(`Error fetching article #${articleNumber}:`, err);
    throw new Error(
      `Failed to fetch article #${articleNumber}${
        includeCauseMessage ? `: ${err.message}` : ""
      }`
    );
  }

  /**
   * Format message text for Telegram
   * @private
   */
  _formatMessage(title, url, featured, items) {
    let text = `⚛️ React - ${title}\n${url}\n\n`;

    if (featured) {
      text += `⭐ Featured:\n${featured.title}\n${featured.url}\n\n`;
    }

    if (items.length) {
      text += `📚 Other articles:\n`;
      items.forEach((item, idx) => {
        text += `${idx + 1}. ${item.title}\n${item.url}\n\n`;
      });
    } else {
      text += "Failed to parse the list of links :(\n";
    }

    return text.trim();
  }

  /**
   * Truncate message if too long
   * @param {string} text - Message text
   * @returns {string} - Truncated text if needed
   */
  truncateMessage(text) {
    if (text.length > MAX_MESSAGE_LENGTH) {
      return (
        text.substring(0, MAX_MESSAGE_LENGTH) + "\n\n... (message truncated)"
      );
    }
    return text;
  }

  /**
   * Get raw React section data (for processing/AI analysis)
   * @param {number} articleNumber - The article number to fetch
   * @returns {Promise<Object>} - Object with title, url, featured, and items
   */
  async getReactSectionData(articleNumber) {
    try {
      return await this._fetchIssueData(articleNumber);
    } catch (err) {
      this._mapToDomainError(err, articleNumber, true);
    }
  }

  /**
   * Fetch article once and return both formatted text and structured data
   * @param {number} articleNumber - The article number to fetch
   * @returns {Promise<{text: string, data: Object}>} - Formatted text and raw data
   */
  async getArticleWithData(articleNumber) {
    try {
      const data = await this._fetchIssueData(articleNumber);
      const text = this.truncateMessage(
        this._formatMessage(data.title, data.url, data.featured, data.items)
      );

      return {
        text,
        data,
      };
    } catch (err) {
      this._mapToDomainError(err, articleNumber, false);
    }
  }

  /**
   * Send a specific article by number
   * @param {number} articleNumber - The article number to fetch
   * @returns {Promise<string>} - Formatted message text
   */
  async getArticle(articleNumber) {
    try {
      const { text } = await this.getArticleWithData(articleNumber);
      return text;
    } catch (err) {
      this._mapToDomainError(err, articleNumber, true);
    }
  }
}

module.exports = new ArticleService();
