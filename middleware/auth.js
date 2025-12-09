const { ALLOWED_USER_IDS } = require("../config/env");

/**
 * Authorization middleware - checks if user is allowed
 * @param {object} ctx - Telegram context
 * @returns {boolean} - true if authorized
 */
function isAuthorized(ctx) {
  const userId = ctx.from?.id?.toString();
  
  // If no allowed users configured, allow everyone
  if (ALLOWED_USER_IDS.length === 0) {
    return true;
  }

  return ALLOWED_USER_IDS.includes(userId);
}

module.exports = {
  isAuthorized,
};

