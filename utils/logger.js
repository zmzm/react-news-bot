/**
 * Logging utility with immediate flush support for Bun watch mode
 */

/**
 * Log info message with immediate flush (for Bun watch mode compatibility)
 * @param {string} message - Message to log
 */
function logInfo(message) {
  // Use console.log for informational messages
  console.log(message);

  // Force flush stdout if available (works in Node.js)
  if (process.stdout && typeof process.stdout.flush === "function") {
    process.stdout.flush();
  }

  // For Bun, ensure output is written immediately
  if (typeof Bun !== "undefined" && process.stdout) {
    // Bun handles this automatically, but we ensure it's written
    process.stdout.write("");
  }
}

/**
 * Sanitize API key from strings (for logging)
 * @param {string} text - Text that might contain API key
 * @returns {string} - Sanitized text
 */
function sanitizeApiKey(text) {
  if (!text || typeof text !== "string") return text;

  // Replace OpenAI API key patterns (sk- followed by alphanumeric)
  return text.replace(/sk-[A-Za-z0-9]{20,}/g, "sk-***REDACTED***");
}

/**
 * Log error message
 * @param {string} message - Error message
 * @param {Error|string} [error] - Optional error object or string
 */
function logError(message, error) {
  // Sanitize error messages to prevent API key leakage
  const safeMessage = sanitizeApiKey(message);
  console.error(safeMessage);

  if (error) {
    // If error is a string, sanitize it
    if (typeof error === "string") {
      console.error(sanitizeApiKey(error));
    } else if (error instanceof Error) {
      // For Error objects, sanitize the message
      const safeError = sanitizeApiKey(error.message || String(error));
      console.error(safeError);
      // Only log stack trace in development
      if (process.env.NODE_ENV === "development" && error.stack) {
        console.error(sanitizeApiKey(error.stack));
      }
    } else {
      // For other types, convert to string and sanitize
      console.error(sanitizeApiKey(String(error)));
    }
  }
}

/**
 * Log startup information
 * @param {object} options - Startup options
 * @param {boolean} options.isDevelopment - Whether in development mode
 * @param {boolean} options.isBun - Whether running on Bun
 * @param {boolean} options.isNodemon - Whether running with nodemon
 */
function logStartup({ isDevelopment, isBun, isNodemon }) {
  if (isDevelopment || isNodemon) {
    logInfo("🤖 Bot started in DEVELOPMENT mode");
    if (isBun) {
      logInfo(
        "🔄 Hot reload enabled (Bun --watch) - changes will auto-restart the bot"
      );
    } else {
      logInfo(
        "🔄 Hot reload enabled (nodemon) - changes will auto-restart the bot"
      );
    }
  } else {
    logInfo("🤖 Bot started in PRODUCTION mode");
  }
  logInfo(`Bot started with ${isBun ? "Bun" : "Node.js"}`);
}

module.exports = {
  logInfo,
  logError,
  logStartup,
};
