const telegramService = require("../services/telegramService");
const articleService = require("../services/articleService");
const searchService = require("../services/searchService");
const { isAuthorized } = require("../middleware/auth");
const rateLimitMiddleware = require("../middleware/rateLimit");
const {
  validateArticleNumber,
  parseCommandArgs,
} = require("../utils/validators");
const { OPENAI_API_KEY, NODE_ENV } = require("../config/env");
const { calculateCost } = require("../utils/openaiSecurity");
const { logInfo, logError } = require("../utils/logger");

/**
 * Register all bot commands with their middleware and handlers
 *
 * Commands:
 * - /start - Welcome message (no middleware)
 * - /now - Manual check for new articles (auth + rate limit)
 * - /article <number> - Fetch specific article (rate limit)
 * - /digest <number> - Generate detailed AI digest of React section (rate limit)
 * - /search <query> - Search articles by keyword (rate limit)
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
      const { text: messageTextResult, data: reactSectionData } = await articleService.getArticleWithData(articleNumber);

      // Index article for search (non-blocking, don't fail if it errors)
      try {
        const indexedCount = await searchService.indexArticles(
          reactSectionData
        );
        if (indexedCount > 0) {
          logInfo(`Indexed ${indexedCount} articles from issue #${articleNumber}`);
        }
      } catch (indexErr) {
        // Don't fail the command if indexing fails
        logError("Failed to index articles:", indexErr.message);
      }

      await ctx.reply(messageTextResult, {
        disable_web_page_preview: false,
      });
    } catch (err) {
      logError("Error in /article command:", err);

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

    const messageText = ctx.message?.text || "";
    const args = parseCommandArgs(messageText);

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

      // Get article text and structured data in a single fetch
      const { data: reactSectionData } = await articleService.getArticleWithData(
        articleNumber
      );

      // Index articles for search (non-blocking, don't fail if it errors)
      try {
        const indexedCount = await searchService.indexArticles(
          reactSectionData
        );
        if (indexedCount > 0) {
          logInfo(`Indexed ${indexedCount} articles from issue #${articleNumber}`);
        }
      } catch (indexErr) {
        // Don't fail the command if indexing fails
        logError("Failed to index articles:", indexErr.message);
      }

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

      // OpenAI service is loaded lazily to keep OPENAI optional for bot startup.
      // If OPENAI_API_KEY is missing, we exit early above before loading the module.
      const openaiService = require("../services/openaiService");

      // Progress callback to log progress (simplified - no Telegram updates during fetch)
      const progressCallback = (message) => {
        logInfo(`[Digest Progress] ${message}`);
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
      logError(`Error generating digest for article #${articleNumber}:`, err);

      // Provide user-friendly error message
      const errorMessage =
        err.message || "Failed to generate digest. Please try again.";
      await ctx.reply(`❌ ${errorMessage}`);
    }
  });

  // /search command - search articles by keyword
  bot.command("search", rateLimitMiddleware(), async (ctx) => {
    try {
      const messageText = ctx.message?.text || "";
      const args = parseCommandArgs(messageText);

      if (args.length < 1) {
        await ctx.reply(
          "Usage: /search <query>\n\nExample: /search hooks\n\nSearches through all indexed React articles by keyword."
        );
        return;
      }

      const query = args.join(" ").trim();

      // Validate query length
      if (query.length < 2) {
        await ctx.reply("❌ Search query must be at least 2 characters long.");
        return;
      }

      if (query.length > 100) {
        await ctx.reply("❌ Search query is too long (max 100 characters).");
        return;
      }

      await ctx.reply(`🔍 Searching for "${query}"...`);

      // Perform search
      const results = await searchService.search(query, 10);

      if (results.length === 0) {
        await ctx.reply(
          `❌ No articles found matching "${query}".\n\nTry different keywords or check if articles are indexed.`
        );
        return;
      }

      // Format results
      let response = `📚 Found ${results.length} article(s) matching "${query}":\n\n`;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const typeIcon = result.type === "featured" ? "⭐" : "📄";
        const scoreEmoji =
          result.score >= 70 ? "🟢" : result.score >= 40 ? "🟡" : "⚪";

        response += `${i + 1}. ${typeIcon} ${result.title}\n`;
        response += `   Issue #${
          result.issueNumber
        } | Score: ${scoreEmoji} ${Math.round(result.score)}%\n`;
        response += `   ${result.url}\n\n`;

        // Telegram message limit is 4096 characters
        // If response is getting long, send what we have and continue
        if (response.length > 3500 && i < results.length - 1) {
          await ctx.reply(response);
          response = `📚 (continued):\n\n`;
        }
      }

      // Send response
      await ctx.reply(response.trim());
    } catch (err) {
      logError("Error in /search command:", err);

      const errorMessage =
        err.message || "Failed to search articles. Please try again.";
      await ctx.reply(`❌ ${errorMessage}`);
    }
  });
}

module.exports = {
  registerCommands,
};
