const { ALLOWED_USER_IDS } = require("../config/env");

/**
 * Check if user is authorized to execute admin commands
 * Compares user ID against ALLOWED_USER_IDS environment variable
 * If no allowed users configured, allows everyone
 * 
 * @param {object} ctx - Telegram context object
 * @returns {boolean} - true if authorized, false otherwise
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

