const { Telegraf } = require("telegraf");
const { BOT_TOKEN } = require("../config/env");
const articleService = require("./articleService");
const scraper = require("./scraper");
const stateManager = require("../utils/stateManager");

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
    await ctx.reply(truncatedText, {
      disable_web_page_preview: false,
      ...options,
    });
  }

  /**
   * Check for new articles and return content if found
   * @param {object} ctx - Telegraf context (optional, for sending messages)
   * @returns {Promise<{found: boolean, text?: string, articleNumber?: number}>}
   */
  async checkAndSend(ctx = null) {
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
        console.log(
          `No new articles. Current: #${currentArticleNumber}, last: #${state.lastArticle}`
        );
        return { found: false };
      }

      console.log(`Found new article #${currentArticleNumber}, parsing React...`);

      const text = await articleService.getReactSectionText(articleUrl);

      // If context provided, send the message
      if (ctx) {
        await this.sendMessage(ctx, text);
      }

      state.lastArticle = currentArticleNumber;
      await stateManager.save(state);

      console.log(`Processed article #${currentArticleNumber}`);

      return { found: true, text, articleNumber: currentArticleNumber };
    } catch (err) {
      console.error("Error in checkAndSend:", err.message);
      console.error(err.stack);

      // If context provided, send error notification
      if (ctx) {
        try {
          await this.sendMessage(ctx, `⚠️ Error checking article: ${err.message}`);
        } catch (notifyErr) {
          console.error("Failed to send error notification:", notifyErr.message);
        }
      }

      throw err;
    }
  }

  /**
   * Launch the bot
   */
  async launch() {
    // bot.launch() is async but doesn't block, so we wait a bit to ensure it's ready
    await this.bot.launch();
    // Small delay to ensure bot is fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));
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

