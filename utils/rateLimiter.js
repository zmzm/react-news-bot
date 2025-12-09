const { RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_REQUESTS } = require("../config/constants");

class RateLimiter {
  constructor() {
    this.rateLimitMap = new Map();
  }

  /**
   * Check if user has exceeded rate limit
   * @param {string} userId - User ID to check
   * @returns {boolean} - true if allowed, false if rate limited
   */
  check(userId) {
    const now = Date.now();
    const userRequests = this.rateLimitMap.get(userId) || [];

    // Remove old requests outside the window
    const recentRequests = userRequests.filter(
      (time) => now - time < RATE_LIMIT_WINDOW
    );

    if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }

    recentRequests.push(now);
    this.rateLimitMap.set(userId, recentRequests);
    return true;
  }

  /**
   * Clear rate limit for a user (useful for testing)
   * @param {string} userId - User ID to clear
   */
  clear(userId) {
    this.rateLimitMap.delete(userId);
  }

  /**
   * Clear all rate limits
   */
  clearAll() {
    this.rateLimitMap.clear();
  }
}

module.exports = new RateLimiter();

