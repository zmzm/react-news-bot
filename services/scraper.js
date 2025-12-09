const axios = require("axios");
const cheerio = require("cheerio");
const { HTTP_TIMEOUT, MAX_RESPONSE_SIZE } = require("../config/constants");
const { validateArticleUrl } = require("../utils/urlValidator");
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
}

module.exports = new Scraper();

