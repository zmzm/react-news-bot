const rateLimiter = require("../utils/rateLimiter");

/**
 * Rate limiting middleware factory
 * Creates middleware that enforces rate limits per user
 * Uses in-memory rate limiter with configurable window and max requests
 * 
 * @returns {Function} - Telegraf middleware function
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

