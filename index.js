// Set stdout to line-buffered mode for immediate output (especially important in Bun watch mode)
if (process.stdout && process.stdout.isTTY) {
  // In TTY mode, ensure line buffering for immediate output
  process.stdout.setDefaultEncoding('utf8');
}

const telegramService = require("./services/telegramService");
const opsService = require("./services/opsService");
const { registerCommands } = require("./handlers/commands");
const errorHandler = require("./middleware/errorHandler");
const { startScheduler } = require("./scheduler/cron");
const { NODE_ENV } = require("./config/env");
const { logStartup, logError, logInfo } = require("./utils/logger");

// Detect environment
const isDevelopment = NODE_ENV !== "production";
const isBun = typeof Bun !== "undefined";
const isNodemon =
  process.env.nodemon === "true" || process.argv[0].includes("nodemon");

// Register error handler middleware
const bot = telegramService.getBot();
bot.use(errorHandler());

// Register all commands
registerCommands();

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
  logError("Unhandled Rejection at:", { promise, reason });
});

process.on("uncaughtException", (err) => {
  logError("Uncaught Exception:", err);
  process.exit(1);
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  const { logInfo } = require("./utils/logger");
  logInfo(`\nReceived ${signal}, shutting down gracefully...`);

  try {
    await opsService.stop();
    await telegramService.stop(signal);
    logInfo("Bot stopped successfully");

    // Give a small delay for cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    process.exit(0);
  } catch (err) {
    logError("Error during shutdown:", err);
    process.exit(1);
  }
}

// Handle shutdown signals
process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle nodemon restart signal (SIGUSR2)
if (isNodemon) {
  process.once("SIGUSR2", () => gracefulShutdown("SIGUSR2"));
}

// Launch the bot
async function start() {
  try {
    // Log startup messages BEFORE launching bot to ensure they appear immediately
    logStartup({ isDevelopment, isBun, isNodemon });

    // Start health endpoint early so runtime can be inspected even if bot launch is slow.
    await opsService.startHealthServer();

    // Start scheduler BEFORE launching bot
    startScheduler();

    logInfo("Launching Telegram bot...");

    // Launch bot AFTER logging messages
    await telegramService.launch();
    logInfo("Telegram bot launched");

    // Start heartbeat after bot is online
    opsService.startHeartbeat();
  } catch (err) {
    logError("Failed to launch bot:", err);
    process.exit(1);
  }
}

start();
