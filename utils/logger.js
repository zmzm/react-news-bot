/**
 * Logging utility with immediate flush support for Bun watch mode
 */
const LOG_FORMAT = (process.env.LOG_FORMAT || "json").toLowerCase();

/**
 * Log info message with immediate flush (for Bun watch mode compatibility)
 * @param {string} message - Message to log
 * @param {any} [meta] - Optional metadata
 */
function logInfo(message, meta) {
  writeLog("info", message, meta);
}

function sanitize(value) {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return sanitizeApiKey(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeApiKey(value.message || String(value)),
      stack:
        process.env.NODE_ENV === "development" && value.stack
          ? sanitizeApiKey(value.stack)
          : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitize(v);
    }
    return out;
  }
  return sanitizeApiKey(String(value));
}

function writeLog(level, message, meta) {
  const safeMessage = sanitizeApiKey(String(message));
  const safeMeta = meta === undefined ? undefined : sanitize(meta);

  if (LOG_FORMAT === "json") {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message: safeMessage,
      ...(safeMeta !== undefined ? { meta: safeMeta } : {}),
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  } else {
    if (safeMeta !== undefined) {
      if (level === "error") {
        console.error(`${safeMessage} ${JSON.stringify(safeMeta)}`);
      } else {
        console.log(`${safeMessage} ${JSON.stringify(safeMeta)}`);
      }
    } else if (level === "error") {
      console.error(safeMessage);
    } else {
      console.log(safeMessage);
    }
  }

  if (process.stdout && typeof process.stdout.flush === "function") {
    process.stdout.flush();
  }
  if (typeof Bun !== "undefined" && process.stdout) {
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
 * @param {Error|string|any} [error] - Optional error object or metadata
 */
function logError(message, error) {
  writeLog("error", message, error);
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
