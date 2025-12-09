const { RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_REQUESTS } = require("../config/constants");

class RateLimiter {
  constructor() {
    this.rateLimitMap = new Map();
    this.lastCleanup = Date.now();
    this.CLEANUP_INTERVAL = 60 * 60 * 1000; // Cleanup every hour
  }

  /**
   * Periodic cleanup of old entries to prevent memory leaks
   * @private
   */
  _cleanup() {
    const now = Date.now();
    // Only cleanup if enough time has passed
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL) {
      return;
    }

    this.lastCleanup = now;
    const windowStart = now - RATE_LIMIT_WINDOW;

    // Remove users with no recent requests
    for (const [userId, requests] of this.rateLimitMap.entries()) {
      const recentRequests = requests.filter((time) => time >= windowStart);
      if (recentRequests.length === 0) {
        this.rateLimitMap.delete(userId);
      } else {
        this.rateLimitMap.set(userId, recentRequests);
      }
    }
  }

  /**
   * Check if user has exceeded rate limit
   * @param {string} userId - User ID to check
   * @returns {boolean} - true if allowed, false if rate limited
   */
  check(userId) {
    // Periodic cleanup to prevent memory leaks
    this._cleanup();

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

