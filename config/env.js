require("dotenv").config();

/**
 * Validates and exports environment variables
 */
function validateEnv() {
  const required = ["BOT_TOKEN"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `❌ Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
  }

  // Validate BOT_TOKEN format (Telegram bot tokens are ~46 chars)
  if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(process.env.BOT_TOKEN)) {
    console.error("❌ Invalid BOT_TOKEN format");
    process.exit(1);
  }

  // Validate OPENAI_API_KEY format if provided
  if (process.env.OPENAI_API_KEY) {
    const apiKey = process.env.OPENAI_API_KEY.trim();

    // OpenAI API keys start with "sk-" and are typically 51 characters
    // Allow some flexibility for different key types (sk-proj-, etc.)
    if (!apiKey.startsWith("sk-")) {
      console.error("❌ Invalid OPENAI_API_KEY format: Must start with 'sk-'");
      process.exit(1);
    }

    // Validate minimum length (OpenAI keys are at least 20 chars)
    if (apiKey.length < 20) {
      console.error("❌ Invalid OPENAI_API_KEY format: Key is too short");
      process.exit(1);
    }

    // Validate maximum length (OpenAI keys are typically 51-200 chars)
    if (apiKey.length > 200) {
      console.error("❌ Invalid OPENAI_API_KEY format: Key is too long");
      process.exit(1);
    }

    // Warn if key looks suspiciously short (might be incomplete)
    if (apiKey.length < 40) {
      console.warn(
        "⚠️  Warning: OPENAI_API_KEY appears shorter than expected. Please verify it's complete."
      );
    }
  }

  // Validate CRON_TIMEZONE if provided (must be valid IANA timezone)
  if (process.env.CRON_TIMEZONE) {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: process.env.CRON_TIMEZONE });
    } catch {
      console.error(
        `❌ Invalid CRON_TIMEZONE: "${process.env.CRON_TIMEZONE}". Use a valid IANA timezone (e.g. UTC, America/New_York).`
      );
      process.exit(1);
    }
  }

  // Validate health port (optional, 0 disables health server)
  if (process.env.HEALTH_PORT !== undefined) {
    const port = Number(process.env.HEALTH_PORT);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      console.error("❌ Invalid HEALTH_PORT. Must be an integer between 0 and 65535.");
      process.exit(1);
    }
  }

  // Validate heartbeat interval (optional)
  if (process.env.HEARTBEAT_INTERVAL_MINUTES !== undefined) {
    const minutes = Number(process.env.HEARTBEAT_INTERVAL_MINUTES);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      console.error(
        "❌ Invalid HEARTBEAT_INTERVAL_MINUTES. Must be an integer between 0 and 1440."
      );
      process.exit(1);
    }
  }
}

validateEnv();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ALLOWED_USER_IDS: process.env.ALLOWED_USER_IDS
    ? process.env.ALLOWED_USER_IDS.split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [],
  TARGET_CHAT_IDS: process.env.TARGET_CHAT_IDS
    ? process.env.TARGET_CHAT_IDS.split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [],
  HEARTBEAT_CHAT_IDS: process.env.HEARTBEAT_CHAT_IDS
    ? process.env.HEARTBEAT_CHAT_IDS.split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [],
  HEARTBEAT_INTERVAL_MINUTES: process.env.HEARTBEAT_INTERVAL_MINUTES
    ? Number(process.env.HEARTBEAT_INTERVAL_MINUTES)
    : 0,
  HEALTH_HOST: process.env.HEALTH_HOST || "0.0.0.0",
  HEALTH_PORT:
    process.env.HEALTH_PORT !== undefined ? Number(process.env.HEALTH_PORT) : 3001,
  CRON_TIMEZONE: process.env.CRON_TIMEZONE || "UTC",
  LOG_FORMAT: process.env.LOG_FORMAT || "json",
  NODE_ENV: process.env.NODE_ENV || "development",
};
