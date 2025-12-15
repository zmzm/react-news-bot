const telegramService = require("../services/telegramService");
const articleService = require("../services/articleService");
const openaiService = require("../services/openaiService");
const { isAuthorized } = require("../middleware/auth");
const rateLimitMiddleware = require("../middleware/rateLimit");
const {
  validateArticleNumber,
  parseCommandArgs,
} = require("../utils/validators");
const { OPENAI_API_KEY, NODE_ENV } = require("../config/env");
const { calculateCost } = require("../utils/openaiSecurity");
const { logInfo } = require("../utils/logger");

/**
 * Register all bot commands with their middleware and handlers
 *
 * Commands:
 * - /start - Welcome message (no middleware)
 * - /now - Manual check for new articles (auth + rate limit)
 * - /article <number> - Fetch specific article (rate limit)
 * - /digest <number> - Generate detailed AI digest of React section (rate limit)
 */
function registerCommands() {
  const bot = telegramService.getBot();

  // /start command
  bot.start(async (ctx) => {
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
    const result = await telegramService.checkAndSend(ctx);

    if (result.found) {
      await ctx.reply(`✅ Sent article #${result.articleNumber}`);
    } else {
      await ctx.reply("No new articles found.");
    }
  });

  // /article command - get specific article by number
  bot.command("article", rateLimitMiddleware(), async (ctx) => {
    try {
      // Handle case where message text might be undefined
      const messageText = ctx.message?.text || "";
      const args = parseCommandArgs(messageText);

      if (args.length < 1) {
        await ctx.reply("Usage: /article <number>\nExample: /article 260");
        return;
      }

      const validation = validateArticleNumber(args[0]);
      if (!validation.valid) {
        await ctx.reply(`❌ ${validation.error}\n\nExample: /article 260`);
        return;
      }

      const articleNumber = validation.value;

      await ctx.reply(`Fetching article #${articleNumber}, please wait…`);
      const messageTextResult = await articleService.getArticle(articleNumber);
      await ctx.reply(messageTextResult, {
        disable_web_page_preview: false,
      });
    } catch (err) {
      console.error(`Error in /article command:`, err.message);
      console.error("Full error:", err);

      // Provide user-friendly error message
      const errorMessage = err.message || "Unknown error occurred";
      await ctx.reply(
        `❌ ${errorMessage}\n\nIf this persists, the article might have a different structure or may not exist.`
      );
    }
  });

  // /digest command - generate detailed AI digest of React section
  bot.command("digest", rateLimitMiddleware(), async (ctx) => {
    // Check if OpenAI is configured
    if (!OPENAI_API_KEY) {
      await ctx.reply(
        "❌ OpenAI integration is not configured. Please set OPENAI_API_KEY in your environment variables."
      );
      return;
    }

    const args = parseCommandArgs(ctx.message.text);

    if (args.length < 1) {
      await ctx.reply(
        "Usage: /digest <article_number>\n\nExample: /digest 260\n\nGenerates a detailed AI-powered digest of the React section with summaries, key takeaways, and recommendations for each item."
      );
      return;
    }

    const validation = validateArticleNumber(args[0]);
    if (!validation.valid) {
      await ctx.reply(`❌ ${validation.error}\n\nExample: /digest 260`);
      return;
    }

    const articleNumber = validation.value;

    try {
      await ctx.reply(`📚 Fetching article #${articleNumber}...`);

      // Get raw React section data
      const reactSectionData = await articleService.getReactSectionData(
        articleNumber
      );

      // Count total articles to fetch
      const totalArticles =
        (reactSectionData.featured ? 1 : 0) +
        (reactSectionData.items?.length || 0);

      if (totalArticles === 0) {
        await ctx.reply("❌ No articles found in the React section.");
        return;
      }

      await ctx.reply(
        `📥 Fetching content from ${totalArticles} article(s)... This may take a moment.`
      );

      // Progress callback to log progress (simplified - no Telegram updates during fetch)
      const progressCallback = (message) => {
        console.log(`[Digest Progress] ${message}`);
      };

      // Generate digest using OpenAI (fetches and parses all articles)
      const result = await openaiService.createReactDigest(
        reactSectionData,
        progressCallback
      );

      await ctx.reply("🤖 Generating AI digest from parsed content...");

      // Extract digest content and usage info
      const digest = typeof result === "string" ? result : result.content;
      const usage = typeof result === "string" ? null : result.usage;
      const model = typeof result === "string" ? null : result.model;

      // Telegram message limit is 4096 characters
      // Split into multiple messages if needed
      const maxLength = 4000; // Leave some buffer
      if (digest.length <= maxLength) {
        await ctx.reply(digest);
      } else {
        // Split into chunks, trying to break at paragraph boundaries
        const chunks = [];
        let currentChunk = "";
        const paragraphs = digest.split("\n\n");

        for (const paragraph of paragraphs) {
          if (currentChunk.length + paragraph.length + 2 <= maxLength - 100) {
            // Leave room for continuation message
            currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk);
            }
            currentChunk = paragraph;
          }
        }
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        // Send first chunk
        await ctx.reply(chunks[0]);

        // Send remaining chunks
        for (let i = 1; i < chunks.length; i++) {
          await ctx.reply(
            `📄 Digest (continued ${i + 1}/${chunks.length}):\n\n${chunks[i]}`
          );
        }
      }

      // Log token usage and cost in development mode (after digest is sent)
      if (NODE_ENV !== "production" && usage && model) {
        const cost = calculateCost(
          model,
          usage.promptTokens,
          usage.completionTokens
        );

        logInfo("\n" + "=".repeat(60));
        logInfo("📊 OpenAI API Usage (Development Mode)");
        logInfo("=".repeat(60));
        logInfo(`Model: ${model}`);
        logInfo(`Prompt tokens: ${usage.promptTokens.toLocaleString()}`);
        logInfo(
          `Completion tokens: ${usage.completionTokens.toLocaleString()}`
        );
        logInfo(`Total tokens: ${usage.totalTokens.toLocaleString()}`);
        if (cost !== null) {
          logInfo(`Approximate cost: $${cost.toFixed(4)} USD`);
        } else {
          logInfo(
            `Approximate cost: Pricing not available for model "${model}"`
          );
        }
        logInfo("=".repeat(60) + "\n");
      }
    } catch (err) {
      console.error(
        `Error generating digest for article #${articleNumber}:`,
        err.message
      );
      console.error("Full error:", err);

      // Provide user-friendly error message
      const errorMessage =
        err.message || "Failed to generate digest. Please try again.";
      await ctx.reply(`❌ ${errorMessage}`);
    }
  });
}

module.exports = {
  registerCommands,
};
