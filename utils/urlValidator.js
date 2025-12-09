const { ALLOWED_DOMAINS } = require("../config/constants");

/**
 * Strict validation for article URLs (prevents SSRF)
 * Only allows thisweekinreact.com domain
 * 
 * @param {string} url - URL to validate
 * @returns {string} - Validated URL string
 * @throws {Error} - If URL is invalid or not allowed
 */
function validateArticleUrl(url) {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== "https:") {
      throw new Error(
        `Invalid protocol: ${parsed.protocol}. Only HTTPS allowed.`
      );
    }

    // Check if domain is allowed
    const domain = parsed.hostname.toLowerCase();
    const isAllowed = ALLOWED_DOMAINS.some(
      (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
    );

    if (!isAllowed) {
      throw new Error(`Domain ${domain} is not allowed`);
    }

    return parsed.toString();
  } catch (err) {
    throw new Error(`Invalid URL: ${err.message}`);
  }
}

/**
 * Permissive validation for nested links in articles
 * Allows external domains but enforces HTTPS and basic security
 * Blocks localhost and private IP ranges
 * 
 * @param {string} url - URL to validate
 * @returns {string} - Validated URL string
 * @throws {Error} - If URL is invalid or contains blocked domains
 */
function validateNestedUrl(url) {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS and HTTP (some sites may still use HTTP)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(
        `Invalid protocol: ${parsed.protocol}. Only HTTP/HTTPS allowed.`
      );
    }

    // Block dangerous protocols and localhost/internal IPs
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and private IP ranges
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    const isPrivateIP =
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
      hostname === "0.0.0.0" ||
      hostname.includes("[::]");

    if (isLocalhost || isPrivateIP) {
      throw new Error(`Local/internal URLs are not allowed`);
    }

    return parsed.toString();
  } catch (err) {
    throw new Error(`Invalid URL: ${err.message}`);
  }
}

module.exports = {
  validateArticleUrl,
  validateNestedUrl,
};

