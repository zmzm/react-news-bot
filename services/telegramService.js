const { Telegraf } = require("telegraf");
const { BOT_TOKEN } = require("../config/env");
const { TELEGRAM_LAUNCH_TIMEOUT_MS } = require("../config/constants");
const articleService = require("./articleService");
const scraper = require("./scraper");
const stateManager = require("../utils/stateManager");
const observability = require("./observabilityService");
const { logInfo, logError } = require("../utils/logger");
const { NetworkError } = require("../utils/errors");

/**
 * Telegram bot service
 * Manages bot instance, message sending, and article checking
 */
class TelegramService {
  /**
   * Initialize Telegram bot service
   */
  constructor() {
    this.bot = new Telegraf(BOT_TOKEN);
    this.launchTask = null;
  }

  _withTimeout(promise, timeoutMs, operationName) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new NetworkError(
            `${operationName} timed out after ${timeoutMs}ms. Check Telegram API connectivity and BOT_TOKEN.`,
            "TELEGRAM_TIMEOUT"
          )
        );
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Get bot instance
   * @returns {Telegraf}
   */
  getBot() {
    return this.bot;
  }

  /**
   * Send message to chat (context required)
   * @param {object} ctx - Telegraf context
   * @param {string} text - Message text
   * @param {object} options - Telegram sendMessage options
   */
  async sendMessage(ctx, text, options = {}) {
    const truncatedText = articleService.truncateMessage(text);
    try {
      await ctx.reply(truncatedText, {
        disable_web_page_preview: false,
        ...options,
      });
    } catch (err) {
      observability.incSendFailure();
      throw err;
    }
  }

  /**
   * Send message to explicit chat id (used by cron jobs without ctx)
   * @param {string|number} chatId - Telegram chat id
   * @param {string} text - Message text
   * @param {object} options - Telegram sendMessage options
   */
  async sendMessageToChat(chatId, text, options = {}) {
    const truncatedText = articleService.truncateMessage(text);
    try {
      await this.bot.telegram.sendMessage(chatId, truncatedText, {
        disable_web_page_preview: false,
        ...options,
      });
    } catch (err) {
      observability.incSendFailure();
      throw err;
    }
  }

  /**
   * Check for new articles and return content if found
   * @param {object} ctx - Telegraf context (optional, for sending messages)
   * @returns {Promise<{found: boolean, text?: string, articleNumber?: number}>}
   */
  async checkAndSend(ctx = null, targetChatIds = []) {
    try {
      const state = await stateManager.load();
      const articleUrl = await scraper.getLatestArticleUrl();

      const match = articleUrl.match(/newsletter\/(\d+)/);
      const currentArticleNumber = match ? Number(match[1]) : null;

      if (
        !currentArticleNumber ||
        !Number.isInteger(currentArticleNumber) ||
        currentArticleNumber < 1
      ) {
        throw new Error(
          `Failed to extract article number from URL: ${articleUrl}`
        );
      }

      if (currentArticleNumber <= state.lastArticle) {
        logInfo(
          `No new articles. Current: #${currentArticleNumber}, last: #${state.lastArticle}`
        );
        return { found: false };
      }

      logInfo(
        `Found new article #${currentArticleNumber}, parsing React...`
      );

      const { text, data: reactSectionData } = await articleService.getArticleWithData(
        currentArticleNumber
      );

      // If context provided, send the message
      if (ctx) {
        await this.sendMessage(ctx, text);
      } else if (targetChatIds.length > 0) {
        let delivered = 0;

        for (const chatId of targetChatIds) {
          try {
            await this.sendMessageToChat(chatId, text);
            delivered += 1;
          } catch (sendErr) {
            logError(`Failed to send scheduled message to chat ${chatId}:`, sendErr);
          }
        }

        if (delivered === 0) {
          throw new Error("Failed to deliver scheduled message to all configured TARGET_CHAT_IDS");
        }
      }

      state.lastArticle = currentArticleNumber;
      await stateManager.save(state);

      logInfo(`Processed article #${currentArticleNumber}`);

      return {
        found: true,
        text,
        articleNumber: currentArticleNumber,
        reactSectionData,
      };
    } catch (err) {
      logError("Error in checkAndSend:", err);

      // If context provided, send error notification
      if (ctx) {
        try {
          await this.sendMessage(
            ctx,
            `⚠️ Error checking article: ${err.message}`
          );
        } catch (notifyErr) {
          logError("Failed to send error notification:", notifyErr.message);
        }
      }

      throw err;
    }
  }

  /**
   * Launch the bot
   */
  async launch() {
    if (this.launchTask) {
      logInfo("Telegram launch: bot is already running");
      return;
    }

    const timeoutMs = TELEGRAM_LAUNCH_TIMEOUT_MS;

    // Verify basic Telegram API access first to separate network/token failures from long polling start.
    logInfo(`Telegram preflight: calling getMe() with timeout ${timeoutMs}ms`);
    await this._withTimeout(this.bot.telegram.getMe(), timeoutMs, "Telegram getMe()");
    logInfo("Telegram preflight: getMe() succeeded");

    logInfo(`Telegram launch: starting long polling (startup timeout ${timeoutMs}ms)`);
    let markStarted;
    let markStartupFailed;
    const startupSignal = new Promise((resolve, reject) => {
      markStarted = resolve;
      markStartupFailed = reject;
    });

    const launchPromise = this.bot.launch({}, () => {
      logInfo("Telegram launch: long polling started");
      markStarted();
    });

    launchPromise.catch((err) => {
      markStartupFailed(err);
    });

    this.launchTask = launchPromise
      .catch((err) => {
        logError("Telegram polling stopped with error:", err);
      })
      .finally(() => {
        this.launchTask = null;
      });

    await this._withTimeout(startupSignal, timeoutMs, "Telegram launch startup");

    // Small delay to ensure bot is fully initialized
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Stop the bot gracefully
   * @param {string} signal - Signal received
   */
  async stop(signal) {
    await this.bot.stop(signal);
  }
}

module.exports = new TelegramService();
