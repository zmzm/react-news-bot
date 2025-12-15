const { OPENAI } = require("../config/constants");

/**
 * Sanitize API key from strings (for logging)
 * @param {string} text - Text that might contain API key
 * @returns {string} - Sanitized text
 */
function sanitizeApiKey(text) {
  if (!text) return text;

  // Replace OpenAI API key patterns (sk- followed by alphanumeric)
  return text.replace(/sk-[A-Za-z0-9]{20,}/g, "sk-***REDACTED***");
}

/**
 * Validate and sanitize model name (prevent injection)
 * @param {string} model - Model name
 * @returns {string} - Validated model name
 * @throws {Error} - If model is not allowed
 */
function validateModel(model) {
  if (!model || typeof model !== "string") {
    return OPENAI.DEFAULT_MODEL;
  }

  const normalizedModel = model.trim().toLowerCase();

  // Check if model is in allowlist
  const isAllowed = OPENAI.ALLOWED_MODELS.some(
    (allowed) => allowed.toLowerCase() === normalizedModel
  );

  if (!isAllowed) {
    throw new Error(
      `Model "${model}" is not allowed. Allowed models: ${OPENAI.ALLOWED_MODELS.join(
        ", "
      )}`
    );
  }

  return model;
}

/**
 * Validate and clamp token limits
 * @param {number} maxTokens - Requested max tokens
 * @param {number} defaultMaxTokens - Default max tokens for this operation
 * @returns {number} - Validated and clamped token count
 */
function validateMaxTokens(
  maxTokens,
  defaultMaxTokens = OPENAI.MAX_TOKENS.DEFAULT
) {
  if (!maxTokens || typeof maxTokens !== "number") {
    return defaultMaxTokens;
  }

  // Ensure it's a positive integer
  const tokens = Math.floor(Math.max(0, maxTokens));

  // Enforce absolute maximum
  return Math.min(tokens, OPENAI.MAX_TOKENS.MAX_ABSOLUTE);
}

/**
 * Validate and clamp temperature
 * @param {number} temperature - Requested temperature
 * @returns {number} - Validated and clamped temperature
 */
function validateTemperature(temperature) {
  if (temperature === null || temperature === undefined) {
    return 0.7; // Default
  }

  const temp = Number(temperature);

  if (isNaN(temp)) {
    return 0.7; // Default if invalid
  }

  // Clamp to valid range
  return Math.max(
    OPENAI.MIN_TEMPERATURE,
    Math.min(OPENAI.MAX_TEMPERATURE, temp)
  );
}

/**
 * Validate prompt length
 * @param {string} prompt - User prompt
 * @param {number} maxLength - Maximum allowed length
 * @throws {Error} - If prompt exceeds limit
 */
function validatePromptLength(prompt, maxLength = OPENAI.MAX_PROMPT_LENGTH) {
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Prompt must be a non-empty string");
  }

  if (prompt.length > maxLength) {
    throw new Error(
      `Prompt exceeds maximum length of ${maxLength} characters. Current length: ${prompt.length}`
    );
  }
}

/**
 * Validate system prompt length
 * @param {string} systemPrompt - System prompt
 * @throws {Error} - If system prompt exceeds limit
 */
function validateSystemPromptLength(systemPrompt) {
  if (!systemPrompt) return; // Optional

  if (typeof systemPrompt !== "string") {
    throw new Error("System prompt must be a string");
  }

  if (systemPrompt.length > OPENAI.MAX_SYSTEM_PROMPT_LENGTH) {
    throw new Error(
      `System prompt exceeds maximum length of ${OPENAI.MAX_SYSTEM_PROMPT_LENGTH} characters`
    );
  }
}

/**
 * Sanitize content to prevent prompt injection
 * Removes or escapes potentially dangerous patterns
 * @param {string} content - Content to sanitize
 * @returns {string} - Sanitized content
 */
function sanitizeContent(content) {
  if (!content || typeof content !== "string") {
    return "";
  }

  // Remove null bytes and control characters (except newlines and tabs)
  let sanitized = content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

  // Limit excessive whitespace
  sanitized = sanitized.replace(/\n{10,}/g, "\n\n"); // Max 2 consecutive newlines
  sanitized = sanitized.replace(/ {10,}/g, " "); // Max single spaces

  return sanitized.trim();
}

/**
 * Truncate content to safe length
 * @param {string} content - Content to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated content
 */
function truncateContent(
  content,
  maxLength = OPENAI.MAX_ARTICLE_CONTENT_LENGTH
) {
  if (!content || typeof content !== "string") {
    return "";
  }

  if (content.length <= maxLength) {
    return content;
  }

  // Try to truncate at sentence boundary
  const truncated = content.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n");

  const cutPoint = Math.max(lastPeriod, lastNewline);

  if (cutPoint > maxLength * 0.8) {
    // If we found a good break point, use it
    return truncated.substring(0, cutPoint + 1) + "\n\n... (content truncated)";
  }

  return truncated + "\n\n... (content truncated)";
}

/**
 * Calculate approximate cost for OpenAI API usage
 * @param {string} model - Model name
 * @param {number} promptTokens - Number of prompt tokens
 * @param {number} completionTokens - Number of completion tokens
 * @returns {number|null} - Approximate cost in USD, or null if pricing not available
 */
function calculateCost(model, promptTokens, completionTokens) {
  // Validate inputs
  if (!model || typeof model !== "string") {
    return null;
  }

  // Ensure tokens are valid numbers
  const prompt = Number(promptTokens) || 0;
  const completion = Number(completionTokens) || 0;

  // Check if pricing is available for this model
  if (!OPENAI.PRICING || !OPENAI.PRICING[model]) {
    return null;
  }

  const pricing = OPENAI.PRICING[model];

  // Calculate costs (pricing is per 1K tokens)
  const promptCost = (prompt / 1000) * pricing.input;
  const completionCost = (completion / 1000) * pricing.output;

  return promptCost + completionCost;
}

module.exports = {
  sanitizeApiKey,
  validateModel,
  validateMaxTokens,
  validateTemperature,
  validatePromptLength,
  validateSystemPromptLength,
  sanitizeContent,
  truncateContent,
  calculateCost,
};
