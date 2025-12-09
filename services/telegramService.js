const { Telegraf } = require("telegraf");
const { BOT_TOKEN, CHAT_ID } = require("../config/env");
const articleService = require("./articleService");
const scraper = require("./scraper");
const stateManager = require("../utils/stateManager");

class TelegramService {
  constructor() {
    this.bot = new Telegraf(BOT_TOKEN);
    this.chatId = CHAT_ID;
  }

  /**
   * Get bot instance
   * @returns {Telegraf}
   */
  getBot() {
    return this.bot;
  }

  /**
   * Send message to configured chat
   * @param {string} text - Message text
   * @param {object} options - Telegram sendMessage options
   */
  async sendMessage(text, options = {}) {
    const truncatedText = articleService.truncateMessage(text);
    await this.bot.telegram.sendMessage(this.chatId, truncatedText, {
      disable_web_page_preview: false,
      ...options,
    });
  }

  /**
   * Check for new articles and send if found
   */
  async checkAndSend() {
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
        return;
      }

      console.log(`Found new article #${currentArticleNumber}, parsing React...`);

      const text = await articleService.getReactSectionText(articleUrl);
      await this.sendMessage(text);

      state.lastArticle = currentArticleNumber;
      await stateManager.save(state);

      console.log(`Sent article #${currentArticleNumber}`);
    } catch (err) {
      console.error("Error in checkAndSend:", err.message);
      console.error(err.stack);

      // Send error notification to admin
      try {
        await this.sendMessage(`⚠️ Error checking article: ${err.message}`);
      } catch (notifyErr) {
        console.error("Failed to send error notification:", notifyErr.message);
      }
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

