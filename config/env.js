require("dotenv").config();

/**
 * Validates and exports environment variables
 */
function validateEnv() {
  const required = ["BOT_TOKEN", "TELEGRAM_CHAT_ID"];
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

  // Validate CHAT_ID is numeric
  if (!/^-?\d+$/.test(process.env.TELEGRAM_CHAT_ID)) {
    console.error("❌ Invalid TELEGRAM_CHAT_ID format (must be numeric)");
    process.exit(1);
  }
}

validateEnv();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  ALLOWED_USER_IDS: process.env.ALLOWED_USER_IDS
    ? process.env.ALLOWED_USER_IDS.split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [],
  NODE_ENV: process.env.NODE_ENV || "development",
};

