const path = require("path");

module.exports = {
  // File paths
  STATE_FILE: path.join(__dirname, "..", "state.json"),

  // Rate limiting
  RATE_LIMIT_WINDOW: 5 * 60 * 1000, // 5 minutes
  RATE_LIMIT_MAX_REQUESTS: 3,

  // HTTP client configuration
  HTTP_TIMEOUT: 10000, // 10 seconds
  MAX_RESPONSE_SIZE: 5 * 1024 * 1024, // 5MB

  // URL validation
  ALLOWED_DOMAINS: ["thisweekinreact.com"],
  BASE_URL: "https://thisweekinreact.com",

  // Message limits
  MAX_MESSAGE_LENGTH: 4000, // Telegram limit is 4096
  MAX_TITLE_LENGTH: 500,
  ARTICLES_TO_SKIP: ["💸", "🗓"],
  ARTICLES_TO_SKIP_AI: ["🐦", "🎥", "📦"],

  // Cron schedule
  CRON_SCHEDULE: "0 10 * * 4", // Every Thursday at 10:00

  // OpenAI API security limits
  OPENAI: {
    // Allowed models (prevent model injection)
    ALLOWED_MODELS: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o4-mini"],
    DEFAULT_MODEL: "gpt-4.1-mini",

    // Token limits (prevent excessive costs)
    MAX_TOKENS: {
      DEFAULT: 2000,
      DIGEST: 4000,
      MAX_ABSOLUTE: 8000, // Hard limit for any request
    },

    // Input limits (prevent prompt injection and excessive input)
    // Note: MAX_PROMPT_LENGTH includes system prompt + user prompt template + content
    MAX_PROMPT_LENGTH: 200000, // ~50,000 tokens (rough estimate) - increased for digest command
    MAX_SYSTEM_PROMPT_LENGTH: 2000, // ~500 tokens

    // Content limits
    MAX_ARTICLE_CONTENT_LENGTH: 10000, // Characters per article
    MAX_TOTAL_CONTENT_LENGTH: 150000, // Total characters across all articles (must leave room for prompt template)

    // Temperature limits
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,

    // Retry configuration for rate limits
    RETRY: {
      MAX_ATTEMPTS: 3, // Maximum retry attempts
      INITIAL_DELAY: 2000, // Initial delay in ms (2 seconds)
      MAX_DELAY: 60000, // Maximum delay in ms (60 seconds)
      BACKOFF_MULTIPLIER: 2, // Exponential backoff multiplier
    },

    // Pricing per 1K tokens (converted from fine-tuning prices per 1M tokens)
    // Note: These are fine-tuning prices converted to per-1K format
    // Format: { input: price_per_1k_tokens, output: price_per_1k_tokens }
    PRICING: {
      "gpt-4.1": { input: 0.003, output: 0.012 }, // $3.00/1M input, $12.00/1M output
      "gpt-4.1-mini": { input: 0.0008, output: 0.0032 }, // $0.80/1M input, $3.20/1M output
      "gpt-4.1-nano": { input: 0.0002, output: 0.0008 }, // $0.20/1M input, $0.80/1M output
      "o4-mini": { input: 0.004, output: 0.016 }, // $4.00/1M input, $16.00/1M output
    },
  },
};
