const path = require("path");
const { SEARCH_DB_PATH } = require("../config/constants");
const { logInfo, logError } = require("../utils/logger");

// Use Bun's native SQLite if available, otherwise fallback to better-sqlite3 for Node.js
let Database;
let isBun = false;
let sqliteAvailable = false;

// Lazy load SQLite - will be initialized in _initialize()
function loadSQLite() {
  if (sqliteAvailable !== false) return; // Already tried

  try {
    if (typeof Bun !== "undefined") {
      // Bun's native SQLite
      const sqlite = require("bun:sqlite");
      Database = sqlite.Database;
      isBun = true;
      sqliteAvailable = true;
      logInfo("Using Bun's native SQLite");
    } else {
      // Node.js fallback
      Database = require("better-sqlite3");
      sqliteAvailable = true;
      logInfo("Using better-sqlite3 for Node.js");
    }
  } catch (err) {
    logError("Failed to load SQLite module:", err);
    sqliteAvailable = false;
    // Don't throw - allow bot to run without search functionality
  }
}

/**
 * Search service using SQLite with FTS5 for fast keyword search
 * Follows singleton pattern like other services
 * Uses Bun's native SQLite when running on Bun, better-sqlite3 on Node.js
 */
class SearchService {
  constructor() {
    this.db = null;
    this._initialized = false;
  }

  /**
   * Initialize database connection and create tables if needed
   * @private
   */
  _initialize() {
    if (this._initialized) return;

    // Try to load SQLite if not already tried
    if (sqliteAvailable === false) {
      loadSQLite();
    }

    if (!sqliteAvailable) {
      logError("SQLite is not available. Search functionality disabled.");
      this._initialized = true; // Mark as initialized to prevent retries
      return;
    }

    try {
      // Ensure directory exists
      const dbDir = path.dirname(SEARCH_DB_PATH);
      const fs = require("fs");
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database
      if (isBun) {
        // Bun's SQLite API
        this.db = new Database(SEARCH_DB_PATH);
      } else {
        // better-sqlite3 API
        this.db = new Database(SEARCH_DB_PATH);
        // Enable WAL mode for better concurrency
        this.db.pragma("journal_mode = WAL");
      }

      // Create tables
      this._createTables();

      this._initialized = true;
      logInfo("Search database initialized");
    } catch (err) {
      logError("Failed to initialize search database:", err);
      // Don't throw - allow bot to continue without search
      this._initialized = true; // Mark as initialized to prevent retries
      this.db = null;
    }
  }

  /**
   * Create database tables if they don't exist
   * @private
   */
  _createTables() {
    // Main articles table
    this._exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(issue_number, url)
      )
    `);

    this._exec(`
      CREATE INDEX IF NOT EXISTS idx_issue_number ON articles(issue_number)
    `);

    this._exec(`
      CREATE INDEX IF NOT EXISTS idx_type ON articles(type)
    `);

    // Check if FTS5 table exists with old schema (issue_number UNINDEXED)
    // If so, drop and recreate with new schema
    let needsRepopulation = false;
    try {
      const checkStmt = this.db.prepare(`
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name='articles_fts'
      `);
      const existing = checkStmt.get();
      
      if (existing && existing.sql && existing.sql.includes('issue_number UNINDEXED')) {
        logInfo("Updating FTS5 schema to make issue_number searchable...");
        needsRepopulation = true;
        // Drop old FTS5 table and triggers
        this._exec(`DROP TABLE IF EXISTS articles_fts`);
        this._exec(`DROP TRIGGER IF EXISTS articles_fts_insert`);
        this._exec(`DROP TRIGGER IF EXISTS articles_fts_delete`);
        this._exec(`DROP TRIGGER IF EXISTS articles_fts_update`);
      }
    } catch (err) {
      // Table doesn't exist yet, that's fine
    }

    // FTS5 virtual table for full-text search
    // Make issue_number searchable as text (so "260" finds issue 260)
    this._exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
        title,
        issue_number,
        url UNINDEXED,
        type UNINDEXED,
        content='articles',
        content_rowid='id'
      )
    `);

    // Trigger to keep FTS5 in sync with main table
    this._exec(`
      CREATE TRIGGER IF NOT EXISTS articles_fts_insert AFTER INSERT ON articles BEGIN
        INSERT INTO articles_fts(rowid, title, issue_number, url, type)
        VALUES (new.id, new.title, new.issue_number, new.url, new.type);
      END
    `);

    this._exec(`
      CREATE TRIGGER IF NOT EXISTS articles_fts_delete AFTER DELETE ON articles BEGIN
        DELETE FROM articles_fts WHERE rowid = old.id;
      END
    `);

    this._exec(`
      CREATE TRIGGER IF NOT EXISTS articles_fts_update AFTER UPDATE ON articles BEGIN
        DELETE FROM articles_fts WHERE rowid = old.id;
        INSERT INTO articles_fts(rowid, title, issue_number, url, type)
        VALUES (new.id, new.title, new.issue_number, new.url, new.type);
      END
    `);

    // Repopulate FTS5 index if we just migrated
    if (needsRepopulation) {
      logInfo("Repopulating FTS5 index with existing articles...");
      this._exec(`
        INSERT INTO articles_fts(rowid, title, issue_number, url, type)
        SELECT id, title, issue_number, url, type FROM articles
      `);
      logInfo("FTS5 index repopulated successfully");
    }
  }

  /**
   * Execute SQL (wrapper for Bun vs Node.js differences)
   * @private
   */
  _exec(sql) {
    if (isBun) {
      this.db.exec(sql);
    } else {
      this.db.exec(sql);
    }
  }

  /**
   * Get database instance (initializes if needed)
   * @returns {Database}
   */
  getDb() {
    if (!this._initialized) {
      this._initialize();
    }
    return this.db;
  }

  /**
   * Index articles from React section data
   * @param {Object} reactSectionData - Object with issueNumber, featured, items
   * @returns {Promise<number>} - Number of articles indexed
   */
  async indexArticles(reactSectionData) {
    const db = this.getDb();
    if (!db) {
      // SQLite not available, silently skip indexing
      return 0;
    }

    const { issueNumber, featured, items } = reactSectionData;

    if (!issueNumber || (!featured && (!items || items.length === 0))) {
      return 0;
    }

    const articlesToIndex = [];

    // Add featured article
    if (featured && featured.title && featured.url) {
      articlesToIndex.push({
        issueNumber,
        title: featured.title,
        url: featured.url,
        type: "featured",
      });
    }

    // Add list items
    if (items && items.length > 0) {
      for (const item of items) {
        if (item.title && item.url) {
          articlesToIndex.push({
            issueNumber,
            title: item.title,
            url: item.url,
            type: "item",
          });
        }
      }
    }

    if (articlesToIndex.length === 0) {
      return 0;
    }

    // Prepare insert statement
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO articles (issue_number, title, url, type)
      VALUES (?, ?, ?, ?)
    `);

    let count = 0;

    if (isBun) {
      // Bun's transaction API
      const transaction = db.transaction((articles) => {
        let localCount = 0;
        for (const article of articles) {
          try {
            insertStmt.run(
              article.issueNumber,
              article.title,
              article.url,
              article.type
            );
            localCount++;
          } catch (err) {
            logError(`Failed to index article: ${article.title}`, err);
          }
        }
        return localCount;
      });

      count = transaction(articlesToIndex);
    } else {
      // better-sqlite3 transaction API
      const insertMany = db.transaction((articles) => {
        let localCount = 0;
        for (const article of articles) {
          try {
            insertStmt.run(
              article.issueNumber,
              article.title,
              article.url,
              article.type
            );
            localCount++;
          } catch (err) {
            logError(`Failed to index article: ${article.title}`, err);
          }
        }
        return localCount;
      });

      count = insertMany(articlesToIndex);
    }

    logInfo(`Indexed ${count} articles from issue #${issueNumber}`);

    return count;
  }

  /**
   * Search articles by keyword
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results (default: 10)
   * @returns {Promise<Array>} - Array of matching articles with scores
   */
  async search(query, limit = 10) {
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return [];
    }

    const db = this.getDb();
    if (!db) {
      // SQLite not available
      return [];
    }

    const searchQuery = query.trim();

    // Escape FTS5 special characters by quoting each term
    const escapedQuery = searchQuery
      .split(/\s+/)
      .filter(term => term.length > 0)
      .map(term => `"${term.replace(/"/g, '""')}"`)
      .join(' ');

    // FTS5 search with ranking
    // Searches both title and issue_number fields
    // bm25() provides better ranking than rank
    const stmt = db.prepare(`
      SELECT 
        a.issue_number,
        a.title,
        a.url,
        a.type,
        bm25(articles_fts) as score
      FROM articles_fts
      JOIN articles a ON articles_fts.rowid = a.id
      WHERE articles_fts MATCH ?
      ORDER BY bm25(articles_fts) ASC
      LIMIT ?
    `);

    try {
      const results = stmt.all(escapedQuery, limit);

      // Normalize scores (bm25 returns negative values, lower is better)
      // Convert to 0-100 scale where higher is better
      const maxScore = results.length > 0 ? Math.abs(results[0].score) : 1;
      const normalizedResults = results.map((result) => ({
        issueNumber: result.issue_number,
        title: result.title,
        url: result.url,
        type: result.type,
        score: Math.max(
          0,
          Math.min(100, 100 - (Math.abs(result.score) / maxScore) * 100)
        ),
      }));

      return normalizedResults;
    } catch (err) {
      // If query syntax is invalid, try simple search
      if (err.message && err.message.includes("malformed")) {
        return this._simpleSearch(searchQuery, limit);
      }
      throw err;
    }
  }

  /**
   * Simple search fallback for invalid FTS5 queries
   * @private
   */
  _simpleSearch(query, limit) {
    const db = this.getDb();
    const searchTerm = `%${query}%`;

    const stmt = db.prepare(`
      SELECT 
        issue_number,
        title,
        url,
        type,
        50 as score
      FROM articles
      WHERE title LIKE ?
      ORDER BY issue_number DESC
      LIMIT ?
    `);

    const results = stmt.all(searchTerm, limit);
    return results.map((result) => ({
      issueNumber: result.issue_number,
      title: result.title,
      url: result.url,
      type: result.type,
      score: result.score,
    }));
  }

  /**
   * Get article count in index
   * @returns {number} - Total number of indexed articles
   */
  getArticleCount() {
    const db = this.getDb();
    const stmt = db.prepare("SELECT COUNT(*) as count FROM articles");
    const result = stmt.get();
    return result.count;
  }

  /**
   * Get latest indexed issue number
   * @returns {number|null} - Latest issue number or null if empty
   */
  getLatestIssue() {
    const db = this.getDb();
    const stmt = db.prepare(
      "SELECT MAX(issue_number) as max_issue FROM articles"
    );
    const result = stmt.get();
    return result.max_issue || null;
  }

  /**
   * Check if issue is already indexed
   * @param {number} issueNumber - Issue number to check
   * @returns {boolean} - True if issue exists in index
   */
  hasIssue(issueNumber) {
    const db = this.getDb();
    const stmt = db.prepare(
      "SELECT COUNT(*) as count FROM articles WHERE issue_number = ?"
    );
    const result = stmt.get(issueNumber);
    return result.count > 0;
  }

  /**
   * Remove articles for a specific issue (for re-indexing)
   * @param {number} issueNumber - Issue number to remove
   * @returns {number} - Number of articles removed
   */
  removeIssue(issueNumber) {
    const db = this.getDb();
    const stmt = db.prepare("DELETE FROM articles WHERE issue_number = ?");
    const result = stmt.run(issueNumber);
    return result.changes;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      if (isBun) {
        this.db.close();
      } else {
        this.db.close();
      }
      this._initialized = false;
    }
  }
}

module.exports = new SearchService();
