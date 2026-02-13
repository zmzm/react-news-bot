const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const {
  DIGEST_CACHE_FILE,
  DIGEST_CACHE_MAX_ENTRIES,
} = require("../config/constants");
const { logError } = require("../utils/logger");

class DigestCacheService {
  _makeKey(issueNumber, model) {
    return `${issueNumber}:${model || "unknown-model"}`;
  }

  async _load() {
    try {
      const raw = await fsPromises.readFile(DIGEST_CACHE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { entries: {} };
      }
      if (!parsed.entries || typeof parsed.entries !== "object") {
        parsed.entries = {};
      }
      return parsed;
    } catch (err) {
      if (err.code === "ENOENT") {
        return { entries: {} };
      }
      logError("Failed to load digest cache:", err.message);
      return { entries: {} };
    }
  }

  async _save(cache) {
    try {
      const dir = path.dirname(DIGEST_CACHE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempFile = `${DIGEST_CACHE_FILE}.tmp`;
      await fsPromises.writeFile(tempFile, JSON.stringify(cache, null, 2), "utf8");
      await fsPromises.rename(tempFile, DIGEST_CACHE_FILE);
    } catch (err) {
      logError("Failed to save digest cache:", err.message);
    }
  }

  _prune(cache) {
    const entries = Object.entries(cache.entries || {});
    if (entries.length <= DIGEST_CACHE_MAX_ENTRIES) {
      return cache;
    }

    entries.sort((a, b) => {
      const aTs = new Date(a[1]?.updatedAt || a[1]?.createdAt || 0).getTime();
      const bTs = new Date(b[1]?.updatedAt || b[1]?.createdAt || 0).getTime();
      return bTs - aTs;
    });

    const pruned = entries.slice(0, DIGEST_CACHE_MAX_ENTRIES);
    cache.entries = Object.fromEntries(pruned);
    return cache;
  }

  async get(issueNumber, model) {
    const cache = await this._load();
    const key = this._makeKey(issueNumber, model);
    return cache.entries[key] || null;
  }

  async set(issueNumber, model, payload) {
    const cache = await this._load();
    const key = this._makeKey(issueNumber, model);
    const now = new Date().toISOString();
    const previous = cache.entries[key];

    cache.entries[key] = {
      issueNumber,
      model,
      content: payload.content,
      usage: payload.usage || null,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };

    this._prune(cache);
    await this._save(cache);
  }
}

module.exports = new DigestCacheService();
