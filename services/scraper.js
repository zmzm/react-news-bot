const axios = require("axios");
const cheerio = require("cheerio");
const { HTTP_TIMEOUT, MAX_RESPONSE_SIZE } = require("../config/constants");
const {
  validateArticleUrl,
  validateNestedUrl,
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
  /**
   * Fetch HTML content from URL
   * @param {string} url - URL to fetch
   * @returns {Promise<cheerio.Root>} - Cheerio instance
   */
  async fetch(url) {
    try {
      const validatedUrl = validateArticleUrl(url);
      const res = await axios.get(validatedUrl, axiosConfig);

      if (!res.data) {
        throw new NetworkError("Empty response from server");
      }

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
      const res = await axios.get(validatedUrl, {
        ...axiosConfig,
        timeout: HTTP_TIMEOUT * 2, // Give external URLs more time
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ThisWeekInReactBot/1.0)",
        },
      });

      if (!res.data) {
        throw new NetworkError("Empty response from server");
      }

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
