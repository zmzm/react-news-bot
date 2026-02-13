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
      const sqlite = require("bun:sqlite");
      Database = sqlite.Database;
      isBun = true;
      sqliteAvailable = true;
      logInfo("Using Bun's native SQLite");
    } else {
      Database = require("better-sqlite3");
      sqliteAvailable = true;
      logInfo("Using better-sqlite3 for Node.js");
    }
  } catch (err) {
    logError("Failed to load SQLite module:", err);
    sqliteAvailable = false;
  }
}

class SearchService {
  constructor() {
    this.db = null;
    this._initialized = false;
  }

  _initialize() {
    if (this._initialized) return;

    if (sqliteAvailable === false) {
      loadSQLite();
    }

    if (!sqliteAvailable) {
      logError("SQLite is not available. Search functionality disabled.");
      this._initialized = true;
      return;
    }

    try {
      const dbDir = path.dirname(SEARCH_DB_PATH);
      const fs = require("fs");
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new Database(SEARCH_DB_PATH);
      if (!isBun) {
        this.db.pragma("journal_mode = WAL");
      }

      this._createTables();
      this._initialized = true;
      logInfo("Search database initialized");
    } catch (err) {
      logError("Failed to initialize search database:", err);
      this._initialized = true;
      this.db = null;
    }
  }

  _createTables() {
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

    let needsRepopulation = false;
    try {
      const checkStmt = this.db.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='articles_fts'
      `);
      const existing = checkStmt.get();

      if (
        existing &&
        existing.sql &&
        existing.sql.includes("issue_number UNINDEXED")
      ) {
        logInfo("Updating FTS5 schema to make issue_number searchable...");
        needsRepopulation = true;
        this._exec(`DROP TABLE IF EXISTS articles_fts`);
        this._exec(`DROP TRIGGER IF EXISTS articles_fts_insert`);
        this._exec(`DROP TRIGGER IF EXISTS articles_fts_delete`);
        this._exec(`DROP TRIGGER IF EXISTS articles_fts_update`);
      }
    } catch {
      // table may not exist yet
    }

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

    if (needsRepopulation) {
      logInfo("Repopulating FTS5 index with existing articles...");
      this._exec(`
        INSERT INTO articles_fts(rowid, title, issue_number, url, type)
        SELECT id, title, issue_number, url, type FROM articles
      `);
      logInfo("FTS5 index repopulated successfully");
    }
  }

  _exec(sql) {
    this.db.exec(sql);
  }

  getDb() {
    if (!this._initialized) {
      this._initialize();
    }
    return this.db;
  }

  async indexArticles(reactSectionData) {
    const db = this.getDb();
    if (!db) return 0;

    const { issueNumber, featured, items } = reactSectionData;
    if (!issueNumber || (!featured && (!items || items.length === 0))) {
      return 0;
    }

    const articlesToIndex = [];
    if (featured && featured.title && featured.url) {
      articlesToIndex.push({
        issueNumber,
        title: featured.title,
        url: featured.url,
        type: "featured",
      });
    }

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

    if (articlesToIndex.length === 0) return 0;

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO articles (issue_number, title, url, type)
      VALUES (?, ?, ?, ?)
    `);

    const runTx = db.transaction((articles) => {
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

    const count = runTx(articlesToIndex);
    logInfo(`Indexed ${count} articles from issue #${issueNumber}`);
    return count;
  }

  /**
   * Search articles with text and optional filters
   * @param {string} query - Text query (can be empty for filter-only search)
   * @param {number|Object} optionsOrLimit - limit number or options object
   */
  async search(query, optionsOrLimit = 10) {
    const db = this.getDb();
    if (!db) return [];

    const options =
      typeof optionsOrLimit === "object" && optionsOrLimit !== null
        ? optionsOrLimit
        : { limit: optionsOrLimit };

    const limit = Number.isInteger(options.limit)
      ? Math.max(1, Math.min(20, options.limit))
      : 10;
    const searchQuery = typeof query === "string" ? query.trim() : "";
    const filters = {
      issueNumber:
        Number.isInteger(options.issueNumber) && options.issueNumber > 0
          ? options.issueNumber
          : null,
      sinceIssue:
        Number.isInteger(options.sinceIssue) && options.sinceIssue > 0
          ? options.sinceIssue
          : null,
      type:
        options.type === "featured" || options.type === "item"
          ? options.type
          : null,
    };

    const where = [];
    const params = [];
    if (filters.issueNumber !== null) {
      where.push("a.issue_number = ?");
      params.push(filters.issueNumber);
    }
    if (filters.sinceIssue !== null) {
      where.push("a.issue_number >= ?");
      params.push(filters.sinceIssue);
    }
    if (filters.type) {
      where.push("a.type = ?");
      params.push(filters.type);
    }

    if (!searchQuery) {
      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const stmt = db.prepare(`
        SELECT
          a.issue_number,
          a.title,
          a.url,
          a.type,
          50 as score
        FROM articles a
        ${whereClause}
        ORDER BY a.issue_number DESC, a.created_at DESC
        LIMIT ?
      `);

      const rows = stmt.all(...params, limit);
      return rows.map((result) => ({
        issueNumber: result.issue_number,
        title: result.title,
        url: result.url,
        type: result.type,
        score: result.score,
      }));
    }

    const escapedQuery = searchQuery
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `"${term.replace(/"/g, '""')}"`)
      .join(" ");

    const whereClause = where.length ? `AND ${where.join(" AND ")}` : "";
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
      ${whereClause}
      ORDER BY bm25(articles_fts) ASC
      LIMIT ?
    `);

    try {
      const results = stmt.all(escapedQuery, ...params, limit);
      const maxScore = results.length > 0 ? Math.abs(results[0].score) : 1;
      return results.map((result) => ({
        issueNumber: result.issue_number,
        title: result.title,
        url: result.url,
        type: result.type,
        score: Math.max(
          0,
          Math.min(100, 100 - (Math.abs(result.score) / maxScore) * 100)
        ),
      }));
    } catch (err) {
      if (err.message && err.message.includes("malformed")) {
        return this._simpleSearch(searchQuery, limit, filters);
      }
      throw err;
    }
  }

  _simpleSearch(query, limit, filters = {}) {
    const db = this.getDb();
    if (!db) return [];

    const where = ["title LIKE ?"];
    const params = [`%${query}%`];

    if (filters.issueNumber !== null && filters.issueNumber !== undefined) {
      where.push("issue_number = ?");
      params.push(filters.issueNumber);
    }
    if (filters.sinceIssue !== null && filters.sinceIssue !== undefined) {
      where.push("issue_number >= ?");
      params.push(filters.sinceIssue);
    }
    if (filters.type) {
      where.push("type = ?");
      params.push(filters.type);
    }

    const stmt = db.prepare(`
      SELECT
        issue_number,
        title,
        url,
        type,
        50 as score
      FROM articles
      WHERE ${where.join(" AND ")}
      ORDER BY issue_number DESC
      LIMIT ?
    `);

    const rows = stmt.all(...params, limit);
    return rows.map((result) => ({
      issueNumber: result.issue_number,
      title: result.title,
      url: result.url,
      type: result.type,
      score: result.score,
    }));
  }

  getArticleCount() {
    const db = this.getDb();
    if (!db) return 0;
    const stmt = db.prepare("SELECT COUNT(*) as count FROM articles");
    const result = stmt.get();
    return result.count;
  }

  getLatestIssue() {
    const db = this.getDb();
    if (!db) return null;
    const stmt = db.prepare("SELECT MAX(issue_number) as max_issue FROM articles");
    const result = stmt.get();
    return result.max_issue || null;
  }

  hasIssue(issueNumber) {
    const db = this.getDb();
    if (!db) return false;
    const stmt = db.prepare("SELECT COUNT(*) as count FROM articles WHERE issue_number = ?");
    const result = stmt.get(issueNumber);
    return result.count > 0;
  }

  removeIssue(issueNumber) {
    const db = this.getDb();
    if (!db) return 0;
    const stmt = db.prepare("DELETE FROM articles WHERE issue_number = ?");
    const result = stmt.run(issueNumber);
    return result.changes;
  }

  close() {
    if (this.db) {
      this.db.close();
      this._initialized = false;
    }
  }
}

module.exports = new SearchService();
