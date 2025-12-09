const telegramService = require("../services/telegramService");
const articleService = require("../services/articleService");
const { isAuthorized } = require("../middleware/auth");
const rateLimitMiddleware = require("../middleware/rateLimit");

/**
 * Register all bot commands
 */
function registerCommands() {
  const bot = telegramService.getBot();

  // /start command
  bot.start(async (ctx) => {
    console.log(ctx.telegram)
    await ctx.reply(
      "Hi! I'll send you the React section from This Week In React every Thursday 🔥"
    );
  });

  // /now command - manually check for new articles
  bot.command("now", rateLimitMiddleware(), async (ctx) => {
    // Check authorization
    if (!isAuthorized(ctx)) {
      await ctx.reply("❌ You don't have permission to execute this command.");
      return;
    }

    await ctx.reply("Checking the latest article, wait a second…");
    await telegramService.checkAndSend();
    await ctx.reply("Done (or there were no new articles).");
  });

  // /article command - get specific article by number
  bot.command("article", rateLimitMiddleware(), async (ctx) => {
    // Get article number from command arguments
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      await ctx.reply("Usage: /article <number>\nExample: /article 260");
      return;
    }

    const articleNumber = parseInt(args[1], 10);

    // Validate article number
    if (
      isNaN(articleNumber) ||
      !Number.isInteger(articleNumber) ||
      articleNumber < 1
    ) {
      await ctx.reply(
        "❌ Invalid article number. Please provide a positive integer.\nExample: /article 260"
      );
      return;
    }

    try {
      await ctx.reply(`Fetching article #${articleNumber}, please wait…`);
      const messageText = await articleService.getArticle(articleNumber);
      await ctx.reply(messageText, {
        disable_web_page_preview: false,
      });
    } catch (err) {
      console.error(`Error fetching article #${articleNumber}:`, err.message);
      console.error("Full error:", err);
      
      // Provide user-friendly error message
      const errorMessage = err.message || "Unknown error occurred";
      await ctx.reply(`❌ ${errorMessage}\n\nIf this persists, the article might have a different structure or may not exist.`);
    }
  });
}

module.exports = {
  registerCommands,
};

