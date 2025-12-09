// Set stdout to line-buffered mode for immediate output (especially important in Bun watch mode)
if (process.stdout && process.stdout.isTTY) {
  // In TTY mode, ensure line buffering for immediate output
  process.stdout.setDefaultEncoding('utf8');
}

const telegramService = require("./services/telegramService");
const { registerCommands } = require("./handlers/commands");
const errorHandler = require("./middleware/errorHandler");
const { startScheduler } = require("./scheduler/cron");
const { NODE_ENV } = require("./config/env");

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
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  try {
    await telegramService.stop(signal);
    console.log("Bot stopped successfully");

    // Give a small delay for cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
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

// Helper to log with immediate flush (for Bun watch mode compatibility)
function logInfo(message) {
  // Use console.log for informational messages
  console.log(message);
  // Force flush stdout if available (works in Node.js)
  if (process.stdout && typeof process.stdout.flush === "function") {
    process.stdout.flush();
  }
  // For Bun, ensure output is written immediately
  if (typeof Bun !== "undefined" && process.stdout) {
    // Bun handles this automatically, but we ensure it's written
    process.stdout.write("");
  }
}

// Launch the bot
async function start() {
  try {
    // Log startup messages BEFORE launching bot to ensure they appear immediately
    if (isDevelopment || isNodemon) {
      logInfo("🤖 Bot started in DEVELOPMENT mode");
      if (isBun) {
        logInfo("🔄 Hot reload enabled (Bun --watch) - changes will auto-restart the bot");
      } else {
        logInfo("🔄 Hot reload enabled (nodemon) - changes will auto-restart the bot");
      }
    } else {
      logInfo("🤖 Bot started in PRODUCTION mode");
    }
    logInfo(`Bot started with ${isBun ? "Bun" : "Node.js"}`);

    // Start scheduler BEFORE launching bot
    startScheduler();

    // Launch bot AFTER logging messages
    await telegramService.launch();
  } catch (err) {
    console.error("Failed to launch bot:", err);
    process.exit(1);
  }
}

start();
