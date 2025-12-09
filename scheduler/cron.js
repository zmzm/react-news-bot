const cron = require("node-cron");
const { CRON_SCHEDULE } = require("../config/constants");
const telegramService = require("../services/telegramService");

/**
 * Initialize and start cron jobs
 */
function startScheduler() {
  // Cron: every Thursday at 10:00 (server time)
  // Format: "minutes hours * * day_of_week" — 4 = Thursday
  cron.schedule(CRON_SCHEDULE, () => {
    console.log("CRON: Thursday, checking for new article...");
    telegramService.checkAndSend().catch((err) => {
      console.error("CRON job error:", err);
    });
  });

  // Log scheduler start message
  console.log(`Scheduler started - checking every Thursday at 10:00`);
}

module.exports = {
  startScheduler,
};

