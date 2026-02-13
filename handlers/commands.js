const telegramService = require("../services/telegramService");
const articleService = require("../services/articleService");
const searchService = require("../services/searchService");
const digestCacheService = require("../services/digestCacheService");
const observability = require("../services/observabilityService");
const stateManager = require("../utils/stateManager");
const { getSchedulerStatus } = require("../scheduler/cron");
const { isAuthorized } = require("../middleware/auth");
const rateLimitMiddleware = require("../middleware/rateLimit");
const {
  validateArticleNumber,
  parseCommandArgs,
  parseSearchQuery,
} = require("../utils/validators");
const { OPENAI_API_KEY, NODE_ENV } = require("../config/env");
const { calculateCost } = require("../utils/openaiSecurity");
const { logInfo, logError } = require("../utils/logger");

async function rejectIfUnauthorized(ctx) {
  if (isAuthorized(ctx)) {
    return false;
  }

  await ctx.reply("❌ You don't have permission to execute this command.");
  return true;
}

async function sendChunkedText(ctx, text, continuationLabel = "continued") {
  const maxLength = 4000;
  if (text.length <= maxLength) {
    try {
      await ctx.reply(text);
    } catch (err) {
      observability.incSendFailure();
      throw err;
    }
    return;
  }

  const chunks = [];
  let currentChunk = "";
  const paragraphs = text.split("\n\n");

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 <= maxLength - 100) {
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

  try {
    await ctx.reply(chunks[0]);
  } catch (err) {
    observability.incSendFailure();
    throw err;
  }
  for (let i = 1; i < chunks.length; i++) {
    try {
      await ctx.reply(`📄 ${continuationLabel} ${i + 1}/${chunks.length}:\n\n${chunks[i]}`);
    } catch (err) {
      observability.incSendFailure();
      throw err;
    }
  }
}

function formatDigestForChat(rawDigest) {
  if (!rawDigest || typeof rawDigest !== "string") {
    return rawDigest;
  }

  let digest = rawDigest.replace(/\r\n/g, "\n").trim();

  // Normalize common sections for better scanability in Telegram chat.
  digest = digest
    .replace(/^- Summary:?/gim, "📝 Summary:")
    .replace(/^- Key takeaways:?/gim, "🔑 Key takeaways:")
    .replace(/^- Recommendation:?/gim, "✅ Recommendation:")
    .replace(/^  - /gm, "• ")
    .replace(/^- /gm, "• ");

  // Add section separators before likely item titles.
  digest = digest.replace(
    /(^|\n\n)(Item \d+:\s+[^\n]+|Title:\s+[^\n]+|⭐ Featured[^\n]*|[0-9]+\.\s+[^\n]+)/g,
    "\n\n━━━━━━━━━━\n$2"
  );

  return digest.replace(/\n{3,}/g, "\n\n").trim();
}

async function createProgressUpdater(ctx, initialText) {
  let progressMessageId = null;
  let lastProgressText = "";
  let lastUpdateAt = 0;
  const minUpdateIntervalMs = 900;

  try {
    const sent = await ctx.reply(initialText);
    progressMessageId = sent?.message_id || null;
    lastProgressText = initialText;
    lastUpdateAt = Date.now();
  } catch (err) {
    logError("Failed to send initial progress message:", err.message);
  }

  return async (nextText, force = false) => {
    if (!nextText || nextText === lastProgressText) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastUpdateAt < minUpdateIntervalMs) {
      return;
    }

    lastProgressText = nextText;
    lastUpdateAt = now;

    if (!progressMessageId) {
      try {
        await ctx.reply(nextText);
      } catch (err) {
        observability.incSendFailure();
        logError("Failed to send progress update fallback:", err.message);
      }
      return;
    }

    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMessageId,
        undefined,
        nextText
      );
    } catch (err) {
      // Some Telegram clients/chats may not allow edits; fallback to new messages.
      try {
        await ctx.reply(nextText);
      } catch (fallbackErr) {
        observability.incSendFailure();
        logError("Failed to send progress update:", fallbackErr.message);
      }
    }
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, query) {
  if (!query) return text;
  let output = text;
  for (const term of query.split(/\s+/).filter((t) => t.length > 1)) {
    const re = new RegExp(`(${escapeRegExp(term)})`, "ig");
    output = output.replace(re, "[$1]");
  }
  return output;
}

/**
 * Register all bot commands with their middleware and handlers
 *
 * Commands:
 * - /start - Welcome message (no middleware)
 * - /help - Show command guide
 * - /status - Show bot operational status
 * - /now - Manual check for new articles (auth + rate limit)
 * - /article <number> - Fetch specific article (rate limit)
 * - /digest <number> - Generate detailed AI digest of React section (rate limit)
 * - /search <query> - Search articles by keyword (rate limit)
 */
function registerCommands() {
  const bot = telegramService.getBot();

  bot.start(async (ctx) => {
    if (await rejectIfUnauthorized(ctx)) return;
    await ctx.reply(
      "Hi! I'll send you the React section from This Week In React every Thursday 🔥"
    );
  });

  bot.command("help", async (ctx) => {
    if (await rejectIfUnauthorized(ctx)) return;
    const helpText = [
      "🤖 This Week In React Bot - Commands",
      "",
      "/start - Check if bot is alive",
      "/help - Show this help message",
      "/status - Show bot, scheduler and index status",
      "/now - Manually check latest issue (authorized users)",
      "/article <number> - Send React section of specific issue",
      "/digest <number> - Generate AI digest for issue",
      '/search <query> - Search indexed titles (example: /search hooks)',
    ].join("\n");

    await ctx.reply(helpText);
  });

  bot.command("status", rateLimitMiddleware(), async (ctx) => {
    if (await rejectIfUnauthorized(ctx)) return;
    console.log(ctx.message.chat.id)
    try {
      const state = await stateManager.load();
      const schedulerStatus = getSchedulerStatus();

      let articleCount = 0;
      let latestIndexedIssue = null;
      try {
        articleCount = searchService.getArticleCount();
        latestIndexedIssue = searchService.getLatestIssue();
      } catch (searchErr) {
        logError("Search stats are unavailable:", searchErr.message);
      }

      const nextRun = schedulerStatus.nextRunAt
        ? new Date(schedulerStatus.nextRunAt).toISOString()
        : "n/a";
      const lastRun = schedulerStatus.lastRun || {};
      const metrics = observability.getSnapshot();
      const lastRunSummary = lastRun.startedAt
        ? `started=${lastRun.startedAt}, finished=${lastRun.finishedAt || "n/a"}, success=${lastRun.success}`
        : "no runs yet";

      const statusText = [
        "📊 Bot Status",
        "",
        `OpenAI digest: ${OPENAI_API_KEY ? "enabled" : "disabled"}`,
        `State lastArticle: #${state.lastArticle}`,
        `Search index count: ${articleCount}`,
        `Search latest issue: ${latestIndexedIssue || "n/a"}`,
        `Scheduler status: ${schedulerStatus.status}`,
        `Scheduler timezone: ${schedulerStatus.timezone}`,
        `Scheduler next run (ISO): ${nextRun}`,
        `Scheduler targets: ${schedulerStatus.targetChatCount}`,
        `Scheduler in-process: ${schedulerStatus.inProcessRun ? "yes" : "no"}`,
        `Scheduler last run: ${lastRunSummary}`,
        "",
        `parse_success_rate: ${(metrics.parse_success_rate * 100).toFixed(1)}%`,
        `digest_duration_ms_avg: ${Math.round(metrics.digest_duration_ms_avg)}`,
        `send_failures_total: ${metrics.send_failures_total}`,
      ].join("\n");

      await ctx.reply(statusText);
    } catch (err) {
      logError("Error in /status command:", err);
      await ctx.reply("❌ Failed to collect status.");
    }
  });

  bot.command("now", rateLimitMiddleware(), async (ctx) => {
    if (await rejectIfUnauthorized(ctx)) return;

    await ctx.reply("Checking the latest article, wait a second…");
    const result = await telegramService.checkAndSend(ctx);

    if (result.found) {
      await ctx.reply(`✅ Sent article #${result.articleNumber}`);
    } else {
      await ctx.reply("No new articles found.");
    }
  });

  bot.command("article", rateLimitMiddleware(), async (ctx) => {
    if (await rejectIfUnauthorized(ctx)) return;
    try {
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
      const { text: messageTextResult, data: reactSectionData } =
        await articleService.getArticleWithData(articleNumber);

      try {
        await searchService.indexArticles(reactSectionData);
      } catch (indexErr) {
        logError("Failed to index articles:", indexErr.message);
      }

      await ctx.reply(messageTextResult, {
        disable_web_page_preview: false,
      });
    } catch (err) {
      logError("Error in /article command:", err);

      const errorMessage = err.message || "Unknown error occurred";
      await ctx.reply(
        `❌ ${errorMessage}\n\nIf this persists, the article might have a different structure or may not exist.`
      );
    }
  });

  bot.command("digest", rateLimitMiddleware(), async (ctx) => {
    if (await rejectIfUnauthorized(ctx)) return;
    const digestStartedAt = Date.now();
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
      const updateProgress = await createProgressUpdater(
        ctx,
        `📚 Digest #${articleNumber}: fetching newsletter issue...`
      );

      const { data: reactSectionData } = await articleService.getArticleWithData(
        articleNumber
      );

      try {
        await searchService.indexArticles(reactSectionData);
      } catch (indexErr) {
        logError("Failed to index articles:", indexErr.message);
      }

      const totalArticles =
        (reactSectionData.featured ? 1 : 0) +
        (reactSectionData.items?.length || 0);

      if (totalArticles === 0) {
        await ctx.reply("❌ No articles found in the React section.");
        return;
      }

      await updateProgress(
        `📥 Digest #${articleNumber}: fetching ${totalArticles} article(s)...`
      );

      const openaiService = require("../services/openaiService");
      const progressCallback = async (message) => {
        logInfo(`[Digest Progress] ${message}`);
        await updateProgress(`📥 Digest #${articleNumber}: ${message}`);
      };

      const preferredModel = "gpt-4.1";
      const cachedDigest = await digestCacheService.get(articleNumber, preferredModel);

      let result;
      if (cachedDigest?.content) {
        logInfo(`Using cached digest for issue #${articleNumber} (${preferredModel})`);
        await updateProgress(
          `♻️ Digest #${articleNumber}: using cached result.`,
          true
        );
        result = {
          content: cachedDigest.content,
          usage: cachedDigest.usage || null,
          model: cachedDigest.model || preferredModel,
        };
      } else {
        await updateProgress(
          `🧠 Digest #${articleNumber}: generating AI digest...`,
          true
        );
        result = await openaiService.createReactDigest(
          reactSectionData,
          progressCallback
        );
      }

      await updateProgress(
        `📝 Digest #${articleNumber}: preparing response...`,
        true
      );

      const rawDigest = typeof result === "string" ? result : result.content;
      const digest = formatDigestForChat(rawDigest);
      const usage = typeof result === "string" ? null : result.usage;
      const model = typeof result === "string" ? null : result.model;

      await updateProgress(`📤 Digest #${articleNumber}: sending to chat...`, true);
      await sendChunkedText(ctx, digest, "Digest (continued)");

      if (!cachedDigest?.content && digest && model) {
        await digestCacheService.set(articleNumber, model, {
          content: rawDigest,
          usage,
        });
      }

      await updateProgress(`✅ Digest #${articleNumber}: done.`, true);

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
        logInfo(`Completion tokens: ${usage.completionTokens.toLocaleString()}`);
        logInfo(`Total tokens: ${usage.totalTokens.toLocaleString()}`);
        if (cost !== null) {
          logInfo(`Approximate cost: $${cost.toFixed(4)} USD`);
        } else {
          logInfo(`Approximate cost: Pricing not available for model "${model}"`);
        }
        logInfo("=".repeat(60) + "\n");
      }
    } catch (err) {
      logError(`Error generating digest for article #${articleNumber}:`, err);

      const errorMessage =
        err.message || "Failed to generate digest. Please try again.";
      await ctx.reply(`❌ ${errorMessage}`);
    } finally {
      observability.recordDigestDuration(Date.now() - digestStartedAt);
    }
  });

  bot.command("search", rateLimitMiddleware(), async (ctx) => {
    if (await rejectIfUnauthorized(ctx)) return;
    try {
      const messageText = ctx.message?.text || "";
      const args = parseCommandArgs(messageText);

      if (args.length < 1) {
        await ctx.reply(
          "Usage: /search <query|filters>\n\nExamples:\n/search hooks\n/search #262\n/search hooks featured limit:5\n/search state since:250 type:item"
        );
        return;
      }

      const rawQuery = args.join(" ").trim();
      const parsed = parseSearchQuery(rawQuery);
      if (!parsed.valid) {
        await ctx.reply(`❌ ${parsed.error}`);
        return;
      }

      const { query, issueNumber, sinceIssue, type, limit } = parsed.filters;

      await ctx.reply(`🔍 Searching (${rawQuery})...`);

      const results = await searchService.search(query, {
        issueNumber,
        sinceIssue,
        type,
        limit,
      });

      if (results.length === 0) {
        await ctx.reply(
          `❌ No articles found for "${rawQuery}".\n\nTry a different query or relax filters.`
        );
        return;
      }

      const activeFilters = [];
      if (issueNumber) activeFilters.push(`#${issueNumber}`);
      if (sinceIssue) activeFilters.push(`since:${sinceIssue}`);
      if (type) activeFilters.push(`type:${type}`);
      activeFilters.push(`limit:${limit}`);

      let response = `📚 Found ${results.length} article(s)\n`;
      response += `Query: ${query || "(filter-only)"}\n`;
      response += `Filters: ${activeFilters.join(", ")}\n\n`;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const typeIcon = result.type === "featured" ? "⭐" : "📄";
        const scoreEmoji =
          result.score >= 70 ? "🟢" : result.score >= 40 ? "🟡" : "⚪";
        const title = highlightText(result.title, query);

        response += `${i + 1}. ${typeIcon} ${title}\n`;
        response += `   Issue #${result.issueNumber} | Score: ${scoreEmoji} ${Math.round(
          result.score
        )}%\n`;
        response += `   ${result.url}\n\n`;

        if (response.length > 3500 && i < results.length - 1) {
          await ctx.reply(response);
          response = `📚 (continued):\n\n`;
        }
      }

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
