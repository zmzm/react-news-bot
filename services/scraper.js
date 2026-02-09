const axios = require("axios");
const cheerio = require("cheerio");
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
      const validatedUrl = validateNestedUrl(url);
      await assertExternalUrlResolvesPublicly(validatedUrl);

      const res = await axios.get(validatedUrl, {
        ...axiosConfig,
        timeout: HTTP_TIMEOUT * 2, // Give external URLs more time
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ThisWeekInReactBot/1.0)",
        },
      });

      if (!res.data) {
        throw new NetworkError("Empty response from server");
      }

      // Validate final URL after redirects to prevent redirect-based SSRF bypass.
      const finalUrl =
        res.request?.res?.responseUrl ||
        res.request?.responseURL ||
        validatedUrl;
      const validatedFinalUrl = validateNestedUrl(finalUrl);
      await assertExternalUrlResolvesPublicly(validatedFinalUrl);

      return cheerio.load(res.data);
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
}

module.exports = new Scraper();
