/**
 * Validation utilities for command arguments and inputs
 */

/**
 * Validate article number
 * @param {any} value - Value to validate
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
function validateArticleNumber(value) {
  if (value === undefined || value === null || value === "") {
    return { valid: false, error: "Article number is required" };
  }

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    return { valid: false, error: "Article number must contain digits only" };
  }

  const articleNumber = Number(normalized);

  if (Number.isNaN(articleNumber)) {
    return { valid: false, error: "Article number must be a valid integer" };
  }

  if (!Number.isInteger(articleNumber)) {
    return { valid: false, error: "Article number must be an integer" };
  }

  if (articleNumber < 1) {
    return { valid: false, error: "Article number must be a positive integer" };
  }

  return { valid: true, value: articleNumber };
}

/**
 * Parse command arguments from message text
 * Handles commands with or without bot username (e.g., /article or /article@botname)
 * @param {string} text - Message text
 * @returns {string[]} - Array of arguments
 */
function parseCommandArgs(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  // Remove bot username if present (e.g., /article@botname -> /article)
  // Split by whitespace and remove first element (command name)
  const parts = text.trim().split(/\s+/);

  // Remove command name (first part, which may include @botname)
  if (parts.length > 0) {
    parts.shift();
  }

  return parts.filter((arg) => arg.length > 0); // Filter out empty strings
}

module.exports = {
  validateArticleNumber,
  parseCommandArgs,
};
