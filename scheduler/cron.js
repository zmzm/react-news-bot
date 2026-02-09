const cron = require("node-cron");
const { CRON_SCHEDULE } = require("../config/constants");
const { TARGET_CHAT_IDS, CRON_TIMEZONE } = require("../config/env");
const telegramService = require("../services/telegramService");
const { logInfo, logError } = require("../utils/logger");

/**
 * Initialize and start cron jobs
 * Schedules weekly article check (Thursday at 10:00)
 * Calls telegramService.checkAndSend() when triggered
 */
function startScheduler() {
  // Cron: every Thursday at 10:00 (configured timezone)
  // Format: "minutes hours * * day_of_week" — 4 = Thursday
  cron.schedule(CRON_SCHEDULE, () => {
    logInfo("CRON: Thursday, checking for new article...");
    telegramService.checkAndSend(null, TARGET_CHAT_IDS).catch((err) => {
      logError("CRON job error:", err);
    });
  }, {
    timezone: CRON_TIMEZONE,
  });

  const targetCount = TARGET_CHAT_IDS.length;
  logInfo(
    `Scheduler started - checking every Thursday at 10:00 (${CRON_TIMEZONE}), target chats: ${targetCount}`
  );
  if (targetCount === 0) {
    logInfo("No TARGET_CHAT_IDS configured. Scheduled checks will run, but no chat will receive auto-sent messages.");
  }
}

module.exports = {
  startScheduler,
};
