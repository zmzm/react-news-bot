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

  const articleNumber = parseInt(value, 10);

  if (isNaN(articleNumber)) {
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
 * @param {string} text - Message text
 * @returns {string[]} - Array of arguments
 */
function parseCommandArgs(text) {
  return text.split(/\s+/).slice(1); // Remove command name
}

module.exports = {
  validateArticleNumber,
  parseCommandArgs,
};

