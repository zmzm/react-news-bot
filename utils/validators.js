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

/**
 * Parse /search query into structured filters
 * Supported tokens:
 * - #262 or issue:262
 * - since:250
 * - featured | item | type:featured | type:item
 * - limit:5
 * All other tokens are treated as free-text search terms.
 *
 * @param {string} rawQuery
 * @returns {{valid: boolean, filters?: object, error?: string}}
 */
function parseSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") {
    return { valid: false, error: "Search query is required" };
  }

  const tokens = rawQuery.trim().split(/\s+/).filter(Boolean);
  const terms = [];
  let issueNumber = null;
  let sinceIssue = null;
  let type = null;
  let limit = 10;

  for (const token of tokens) {
    let match = token.match(/^#(\d+)$/);
    if (match) {
      issueNumber = Number(match[1]);
      continue;
    }

    match = token.match(/^issue:(\d+)$/i);
    if (match) {
      issueNumber = Number(match[1]);
      continue;
    }

    match = token.match(/^since:(\d+)$/i);
    if (match) {
      sinceIssue = Number(match[1]);
      continue;
    }

    match = token.match(/^limit:(\d+)$/i);
    if (match) {
      limit = Number(match[1]);
      continue;
    }

    if (/^(featured|type:featured)$/i.test(token)) {
      type = "featured";
      continue;
    }

    if (/^(item|items|type:item|type:items)$/i.test(token)) {
      type = "item";
      continue;
    }

    terms.push(token);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return { valid: false, error: "limit must be between 1 and 20" };
  }

  if (issueNumber !== null && (!Number.isInteger(issueNumber) || issueNumber < 1)) {
    return { valid: false, error: "issue number must be a positive integer" };
  }

  if (sinceIssue !== null && (!Number.isInteger(sinceIssue) || sinceIssue < 1)) {
    return { valid: false, error: "since issue must be a positive integer" };
  }

  const textQuery = terms.join(" ").trim();
  if (textQuery && textQuery.length < 2) {
    return { valid: false, error: "text query must be at least 2 characters long" };
  }

  if (textQuery.length > 100) {
    return { valid: false, error: "text query is too long (max 100 characters)" };
  }

  if (!textQuery && issueNumber === null && sinceIssue === null && !type) {
    return { valid: false, error: "Provide text or filters (e.g. #262, since:250, featured)" };
  }

  return {
    valid: true,
    filters: {
      query: textQuery,
      issueNumber,
      sinceIssue,
      type,
      limit,
    },
  };
}

module.exports = {
  validateArticleNumber,
  parseCommandArgs,
  parseSearchQuery,
};
