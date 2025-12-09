const { AppError, NetworkError, ValidationError, ParsingError, NotFoundError } = require("../utils/errors");

/**
 * Error handler middleware for Telegram bot
 * Categorizes errors and provides appropriate user-facing messages
 */
function errorHandler() {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      // Log full error details server-side
      console.error("Bot error:", {
        message: err.message,
        stack: err.stack,
        code: err.code,
        userId: ctx.from?.id,
        command: ctx.message?.text,
      });

      // Determine user-friendly error message based on error type
      let userMessage = "An error occurred. Please try again later.";

      // Use error class hierarchy for better categorization
      if (err instanceof NotFoundError) {
        userMessage = `❌ ${err.message}`;
      } else if (err instanceof ValidationError) {
        userMessage = `❌ ${err.message}`;
      } else if (err instanceof ParsingError) {
        userMessage = `❌ ${err.message}`;
      } else if (err instanceof NetworkError) {
        if (err.statusCode >= 500) {
          userMessage = "❌ Server error. Please try again later.";
        } else {
          userMessage = `❌ ${err.message}`;
        }
      } else if (err instanceof AppError) {
        userMessage = `❌ ${err.message}`;
      }
      // Fallback for legacy errors
      else if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") {
        userMessage = "❌ Network error. Please check your connection and try again.";
      } else if (err.response) {
        const status = err.response.status;
        if (status === 404) {
          userMessage = "❌ Resource not found. Please check the article number.";
        } else if (status >= 500) {
          userMessage = "❌ Server error. Please try again later.";
        } else {
          userMessage = `❌ Error ${status}. Please try again.`;
        }
      } else if (err.message.includes("Invalid") || err.message.includes("not allowed")) {
        userMessage = `❌ ${err.message}`;
      } else if (err.message.includes("not found") || err.message.includes("structure")) {
        userMessage = `❌ ${err.message}`;
      } else if (err.message.includes("rate limit") || err.message.includes("Too many")) {
        userMessage = "⏳ Too many requests. Please wait a few minutes.";
      }

      // Send error message to user
      try {
        await ctx.reply(userMessage);
      } catch (replyErr) {
        console.error("Failed to send error reply:", replyErr.message);
      }
    }
  };
}

module.exports = errorHandler;

