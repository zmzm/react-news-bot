const cron = require("node-cron");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const {
  CRON_SCHEDULE,
  SCHEDULER_LOCK_FILE,
  SCHEDULER_LOCK_TTL_MS,
} = require("../config/constants");
const {
  TARGET_CHAT_IDS,
  CRON_TIMEZONE,
  OPENAI_API_KEY,
  OBSIDIAN_VAULT_PATH,
} = require("../config/env");
const telegramService = require("../services/telegramService");
const { logInfo, logError } = require("../utils/logger");

let schedulerTask = null;
let inProcessRun = false;
let lastRun = {
  startedAt: null,
  finishedAt: null,
  success: null,
  skippedReason: null,
  error: null,
};

async function ensureLockDir() {
  const lockDir = path.dirname(SCHEDULER_LOCK_FILE);
  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }
}

async function readLockMeta() {
  try {
    const raw = await fsPromises.readFile(SCHEDULER_LOCK_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function acquireLock() {
  await ensureLockDir();

  const tryAcquire = async () => {
    const handle = await fsPromises.open(SCHEDULER_LOCK_FILE, "wx");
    const metadata = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    await handle.writeFile(JSON.stringify(metadata), "utf8");
    return handle;
  };

  try {
    return await tryAcquire();
  } catch (err) {
    if (err.code !== "EEXIST") {
      throw err;
    }

    const lockMeta = await readLockMeta();
    if (!lockMeta?.startedAt) {
      return null;
    }

    const lockAge = Date.now() - new Date(lockMeta.startedAt).getTime();
    if (lockAge > SCHEDULER_LOCK_TTL_MS) {
      logInfo("Scheduler lock is stale, removing it.");
      try {
        await fsPromises.unlink(SCHEDULER_LOCK_FILE);
      } catch (unlinkErr) {
        if (unlinkErr.code !== "ENOENT") {
          throw unlinkErr;
        }
      }
      return tryAcquire();
    }

    return null;
  }
}

async function releaseLock(handle) {
  try {
    if (handle) {
      await handle.close();
    }
  } catch (err) {
    logError("Failed to close scheduler lock handle:", err.message);
  }

  try {
    await fsPromises.unlink(SCHEDULER_LOCK_FILE);
  } catch (err) {
    if (err.code !== "ENOENT") {
      logError("Failed to remove scheduler lock file:", err.message);
    }
  }
}

function getSchedulerStatus() {
  return {
    enabled: Boolean(schedulerTask),
    schedule: CRON_SCHEDULE,
    timezone: CRON_TIMEZONE,
    targetChatCount: TARGET_CHAT_IDS.length,
    status: schedulerTask ? schedulerTask.getStatus() : "stopped",
    nextRunAt: schedulerTask?.getNextRun()?.toISOString() || null,
    inProcessRun,
    lastRun: { ...lastRun },
  };
}

async function runScheduledObsidian(articleNumber, reactSectionData) {
  if (!OBSIDIAN_VAULT_PATH) {
    logInfo(
      `CRON: Obsidian save skipped for #${articleNumber} (OBSIDIAN_VAULT_PATH is not configured).`
    );
    return { skipped: true };
  }

  const obsidianService = require("../services/obsidianService");
  let payload;

  if (OPENAI_API_KEY) {
    const openaiService = require("../services/openaiService");
    const digestPayload = await openaiService.generateIssueNotes(reactSectionData);
    payload = await obsidianService.enrichIssueNotesWithFullContent(digestPayload);
  } else {
    payload = await obsidianService.generateIssueNotesFromReactSection(reactSectionData);
  }

  const saveResult = await obsidianService.saveIssueBundle(
    OBSIDIAN_VAULT_PATH,
    payload,
    { overwrite: true }
  );

  logInfo(
    `CRON: Obsidian bundle saved for issue #${articleNumber}: ${saveResult.mocPath}`
  );
  return { skipped: false, saveResult };
}

/**
 * Initialize and start cron jobs
 * Schedules weekly article check (Thursday at 10:00)
 * Calls telegramService.checkAndSend() when triggered
 */
function startScheduler() {
  if (schedulerTask) {
    return;
  }

  // Cron: every Thursday at 10:00 (configured timezone)
  // Format: "minutes hours * * day_of_week" — 4 = Thursday
  schedulerTask = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      if (inProcessRun) {
        lastRun = {
          ...lastRun,
          skippedReason: "Previous run is still in progress",
        };
        logInfo("CRON skipped: previous run is still in progress.");
        return;
      }

      inProcessRun = true;
      lastRun = {
        startedAt: new Date().toISOString(),
        finishedAt: null,
        success: null,
        skippedReason: null,
        error: null,
      };

      let lockHandle = null;
      try {
        lockHandle = await acquireLock();
        if (!lockHandle) {
          lastRun = {
            ...lastRun,
            finishedAt: new Date().toISOString(),
            success: false,
            skippedReason: "Another scheduler instance holds the lock",
          };
          logInfo("CRON skipped: scheduler lock is held by another instance.");
          return;
        }

        logInfo("CRON: Thursday, checking for new article...");
        const checkResult = await telegramService.checkAndSend(
          null,
          TARGET_CHAT_IDS
        );
        if (checkResult?.found && checkResult.articleNumber && checkResult.reactSectionData) {
          await runScheduledObsidian(
            checkResult.articleNumber,
            checkResult.reactSectionData
          );
        }
        lastRun = {
          ...lastRun,
          finishedAt: new Date().toISOString(),
          success: true,
        };
      } catch (err) {
        lastRun = {
          ...lastRun,
          finishedAt: new Date().toISOString(),
          success: false,
          error: err.message || String(err),
        };
        logError("CRON job error:", err);
      } finally {
        await releaseLock(lockHandle);
        inProcessRun = false;
      }
    },
    {
      timezone: CRON_TIMEZONE,
    }
  );

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
  getSchedulerStatus,
};
