/**
 * Error handler middleware for Telegram bot
 */
function errorHandler() {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      console.error("Bot error:", err.message);
      try {
        await ctx.reply("An error occurred. Please try again later.");
      } catch (replyErr) {
        console.error("Failed to send error reply:", replyErr.message);
      }
    }
  };
}

module.exports = errorHandler;

