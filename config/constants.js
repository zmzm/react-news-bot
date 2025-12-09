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

  // Cron schedule
  CRON_SCHEDULE: "0 10 * * 4", // Every Thursday at 10:00
};

