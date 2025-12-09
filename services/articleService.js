const { validateArticleUrl, validateNestedUrl } = require("../utils/urlValidator");
const { MAX_TITLE_LENGTH, MAX_MESSAGE_LENGTH } = require("../config/constants");
const scraper = require("./scraper");

class ArticleService {
  /**
   * Parse the ⚛️ React section from a specific article
   * @param {string} articleUrl - URL of the article
   * @returns {Promise<string>} - Formatted text for Telegram
   */
  async getReactSectionText(articleUrl) {
    const validatedUrl = validateArticleUrl(articleUrl);
    const $ = await scraper.fetch(validatedUrl);

    const title = $("h1").first().text().trim() || "This Week In React";

    // Try multiple strategies to find React section
    const reactHeading = this._findReactSection($);

    if (!reactHeading || !reactHeading.length) {
      // Check if this is a special article (announcement, etc.)
      const allHeadings = $("h1, h2, h3").map((_, el) => $(el).text().trim()).get();
      const isSpecialArticle = allHeadings.some(h => 
        h.toLowerCase().includes("announcement") ||
        h.toLowerCase().includes("launch") ||
        h.toLowerCase().includes("special")
      );

      if (isSpecialArticle) {
        throw new Error(
          "This article is a special announcement and doesn't contain a React section. " +
          "It may be about a launch, update, or other special content."
        );
      }

      throw new Error(
        "React section not found in the article. " +
        "This article might have a different structure or may not contain React-related content."
      );
    }

    // Featured article right under the heading
    const featured = this._extractFeatured($, reactHeading, validatedUrl);

    // List of other links
    const items = this._extractItems($, reactHeading, validatedUrl);

    return this._formatMessage(title, validatedUrl, featured, items);
  }

  /**
   * Find React section heading using multiple strategies
   * @private
   */
  _findReactSection($) {
    // Strategy 1: Look for h2 containing "React" (case-insensitive)
    let heading = $("h2")
      .filter((_, el) => {
        const text = $(el).text().toLowerCase();
        return text.includes("react") && !text.includes("react-native");
      })
      .first();

    if (heading.length) {
      console.log("Found React section using Strategy 1 (h2 with 'React')");
      return heading;
    }

    // Strategy 2: Look for h2 with emoji ⚛️
    heading = $("h2").filter((_, el) => {
      const html = $(el).html() || "";
      return html.includes("⚛️") || html.includes("React");
    }).first();

    if (heading.length) {
      console.log("Found React section using Strategy 2 (h2 with emoji)");
      return heading;
    }

    // Strategy 3: Look for any heading with "React" in text
    heading = $("h1, h2, h3")
      .filter((_, el) => {
        const text = $(el).text().toLowerCase();
        return text.includes("react") && !text.includes("react-native");
      })
      .first();

    if (heading.length) {
      console.log("Found React section using Strategy 3 (any heading with 'React')");
      return heading;
    }

    // Debug: Log available headings for troubleshooting
    const allHeadings = $("h1, h2, h3").map((_, el) => $(el).text().trim()).get();
    console.warn("Available headings in article:", allHeadings);
    
    return heading;
  }

  /**
   * Extract featured article
   * @private
   */
  _extractFeatured($, reactHeading, baseUrl) {
    // Try multiple strategies to find featured link
    let featuredLink = null;

    // Strategy 1: First link after heading
    featuredLink = reactHeading.nextAll("a").first();
    
    // Strategy 2: First link in next paragraph
    if (!featuredLink.length) {
      const nextP = reactHeading.nextAll("p").first();
      if (nextP.length) {
        featuredLink = nextP.find("a").first();
      }
    }

    // Strategy 3: First link in next div
    if (!featuredLink.length) {
      const nextDiv = reactHeading.nextAll("div").first();
      if (nextDiv.length) {
        featuredLink = nextDiv.find("a").first();
      }
    }

    if (!featuredLink || !featuredLink.length) return null;

    let featured = {
      title: featuredLink.text().trim(),
      url: featuredLink.attr("href"),
    };

    // Skip if no URL
    if (!featured.url) return null;

    // Resolve relative URLs
    if (!featured.url.startsWith("http")) {
      featured.url = new URL(featured.url, baseUrl).toString();
    }

    // Validate featured URL (allow external domains)
    try {
      featured.url = validateNestedUrl(featured.url);
      featured.title = featured.title.substring(0, MAX_TITLE_LENGTH);
      return featured;
    } catch (err) {
      console.warn(`Invalid featured URL: ${featured.url} - ${err.message}`);
      return null;
    }
  }

  /**
   * Extract list items from React section
   * @private
   */
  _extractItems($, reactHeading, baseUrl) {
    const items = [];
    let current = reactHeading.next();
    const maxIterations = 100; // Prevent infinite loops
    let iterations = 0;

    while (current.length && iterations < maxIterations) {
      iterations++;
      const tag = (current[0].tagName || "").toLowerCase();

      // Stop at next major section (h1, h2)
      if (tag === "h1" || tag === "h2") {
        // Check if it's still part of React section (not React-Native, etc.)
        const text = current.text().toLowerCase();
        if (text.includes("react-native") || text.includes("other") || text.includes("fun")) {
          break;
        }
      }

      // Extract links from lists
      if (tag === "ul" || tag === "ol") {
        current.find("li a").each((_, a) => {
          const $a = $(a);
          let url = $a.attr("href");
          if (!url) return;

          // Resolve relative URLs
          if (!url.startsWith("http")) {
            url = new URL(url, baseUrl).toString();
          }

          // Validate and sanitize URLs (allow external domains)
          try {
            const validatedItemUrl = validateNestedUrl(url);
            const title = $a.text().trim();
            
            // Skip empty titles
            if (!title) return;

            items.push({
              title: title.substring(0, MAX_TITLE_LENGTH),
              url: validatedItemUrl,
            });
          } catch (err) {
            console.warn(`Skipping invalid URL: ${url} - ${err.message}`);
          }
        });
      }

      // Also check for links in paragraphs (some articles might format differently)
      if (tag === "p") {
        current.find("a").each((_, a) => {
          const $a = $(a);
          let url = $a.attr("href");
          if (!url) return;

          if (!url.startsWith("http")) {
            url = new URL(url, baseUrl).toString();
          }

          try {
            const validatedItemUrl = validateNestedUrl(url);
            const title = $a.text().trim();
            
            if (!title) return;

            items.push({
              title: title.substring(0, MAX_TITLE_LENGTH),
              url: validatedItemUrl,
            });
          } catch (err) {
            console.warn(`Skipping invalid URL: ${url} - ${err.message}`);
          }
        });
      }

      current = current.next();
    }

    return items;
  }

  /**
   * Format message text for Telegram
   * @private
   */
  _formatMessage(title, url, featured, items) {
    let text = `⚛️ React — ${title}\n${url}\n\n`;

    if (featured) {
      text += `⭐ Featured:\n${featured.title}\n${featured.url}\n\n`;
    }

    if (items.length) {
      text += `📚 Other articles:\n`;
      items.forEach((item, idx) => {
        text += `${idx + 1}. ${item.title}\n${item.url}\n\n`;
      });
    } else {
      text += "Failed to parse the list of links 😔\n";
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
   * Send a specific article by number
   * @param {number} articleNumber - The article number to fetch
   * @returns {Promise<string>} - Formatted message text
   */
  async getArticle(articleNumber) {
    try {
      const articleUrl = scraper.getArticleUrl(articleNumber);
      console.log(`Fetching article #${articleNumber} from ${articleUrl}`);
      const text = await this.getReactSectionText(articleUrl);
      return this.truncateMessage(text);
    } catch (err) {
      // Handle HTTP errors
      if (err.response) {
        const status = err.response.status;
        if (status === 404) {
          throw new Error(`Article #${articleNumber} not found (404)`);
        }
        throw new Error(`HTTP ${status} error fetching article #${articleNumber}: ${err.message}`);
      }

      // Handle network errors
      if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") {
        throw new Error(`Network error fetching article #${articleNumber}: ${err.message}`);
      }

      // Handle parsing errors
      if (err.message.includes("React section not found")) {
        throw new Error(`Article #${articleNumber} exists but React section not found. The article might have a different structure.`);
      }

      // Handle URL validation errors
      if (err.message.includes("Invalid URL") || err.message.includes("not allowed")) {
        throw new Error(`Invalid URL for article #${articleNumber}: ${err.message}`);
      }

      // Generic error with original message
      console.error(`Error fetching article #${articleNumber}:`, err);
      throw new Error(`Failed to fetch article #${articleNumber}: ${err.message}`);
    }
  }
}

module.exports = new ArticleService();
