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
 * Log error message
 * @param {string} message - Error message
 * @param {Error} [error] - Optional error object
 */
function logError(message, error) {
  console.error(message);
  if (error) {
    console.error(error);
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
      logInfo("🔄 Hot reload enabled (Bun --watch) - changes will auto-restart the bot");
    } else {
      logInfo("🔄 Hot reload enabled (nodemon) - changes will auto-restart the bot");
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

