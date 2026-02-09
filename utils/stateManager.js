const fsPromises = require("fs").promises;
const { STATE_FILE } = require("../config/constants");
const { logError } = require("./logger");

/**
 * State manager for bot state persistence
 * Handles atomic file operations for tracking last sent article
 */
class StateManager {
  /**
   * Load state from file
   * @returns {Promise<{lastArticle: number}>} - State object with lastArticle number
   */
  async load() {
    try {
      const raw = await fsPromises.readFile(STATE_FILE, "utf8");
      const parsed = JSON.parse(raw);

      // Validate state structure
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Invalid state format");
      }

      if (typeof parsed.lastArticle !== "number" || parsed.lastArticle < 0) {
        parsed.lastArticle = 0;
      }

      return parsed;
    } catch (e) {
      if (e.code === "ENOENT") {
        // File doesn't exist, return default state
        return { lastArticle: 0 };
      }
      logError("Error loading state:", e.message);
      return { lastArticle: 0 };
    }
  }

  /**
   * Save state to file (atomic write)
   * @param {{lastArticle: number}} state - State object to save
   */
  async save(state) {
    try {
      // Validate state before saving
      if (typeof state !== "object" || state === null) {
        throw new Error("Invalid state object");
      }

      if (typeof state.lastArticle !== "number" || state.lastArticle < 0) {
        throw new Error("Invalid lastArticle value");
      }

      const tempFile = `${STATE_FILE}.tmp`;
      const data = JSON.stringify(state, null, 2);

      // Write to temp file first, then rename (atomic operation)
      await fsPromises.writeFile(tempFile, data, "utf8");
      await fsPromises.rename(tempFile, STATE_FILE);
    } catch (e) {
      logError("Error saving state:", e.message);
      throw e;
    }
  }
}

module.exports = new StateManager();
