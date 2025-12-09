const rateLimiter = require("../utils/rateLimiter");

/**
 * Rate limiting middleware factory
 * @returns {Function} - Middleware function
 */
function rateLimitMiddleware() {
  return async (ctx, next) => {
    const userId = ctx.from?.id?.toString();

    if (!rateLimiter.check(userId)) {
      await ctx.reply("⏳ Too many requests. Please wait a few minutes.");
      return;
    }

    await next();
  };
}

module.exports = rateLimitMiddleware;

