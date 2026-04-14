/**
 * Validation utilities for command arguments and inputs
 */
const { OBSIDIAN } = require("../config/constants");

/**
 * Validate article number
 * @param {any} value - Value to validate
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
function validateArticleNumber(value) {
  if (value === undefined || value === null || value === "") {
    return { valid: false, error: "Article number is required" };
  }

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    return { valid: false, error: "Article number must contain digits only" };
  }

  const articleNumber = Number(normalized);

  if (Number.isNaN(articleNumber)) {
    return { valid: false, error: "Article number must be a valid integer" };
  }

  if (!Number.isInteger(articleNumber)) {
    return { valid: false, error: "Article number must be an integer" };
  }

  if (articleNumber < 1) {
    return { valid: false, error: "Article number must be a positive integer" };
  }

  return { valid: true, value: articleNumber };
}

/**
 * Parse command arguments from message text
 * Handles commands with or without bot username (e.g., /article or /article@botname)
 * @param {string} text - Message text
 * @returns {string[]} - Array of arguments
 */
function parseCommandArgs(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  // Remove bot username if present (e.g., /article@botname -> /article)
  // Split by whitespace and remove first element (command name)
  const parts = text.trim().split(/\s+/);

  // Remove command name (first part, which may include @botname)
  if (parts.length > 0) {
    parts.shift();
  }

  return parts.filter((arg) => arg.length > 0); // Filter out empty strings
}

/**
 * Parse /search query into structured filters
 * Supported tokens:
 * - #262 or issue:262
 * - since:250
 * - featured | item | type:featured | type:item
 * - limit:5
 * All other tokens are treated as free-text search terms.
 *
 * @param {string} rawQuery
 * @returns {{valid: boolean, filters?: object, error?: string}}
 */
function parseSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") {
    return { valid: false, error: "Search query is required" };
  }

  const tokens = rawQuery.trim().split(/\s+/).filter(Boolean);
  const terms = [];
  let issueNumber = null;
  let sinceIssue = null;
  let type = null;
  let limit = 10;

  for (const token of tokens) {
    let match = token.match(/^#(\d+)$/);
    if (match) {
      issueNumber = Number(match[1]);
      continue;
    }

    match = token.match(/^issue:(\d+)$/i);
    if (match) {
      issueNumber = Number(match[1]);
      continue;
    }

    match = token.match(/^since:(\d+)$/i);
    if (match) {
      sinceIssue = Number(match[1]);
      continue;
    }

    match = token.match(/^limit:(\d+)$/i);
    if (match) {
      limit = Number(match[1]);
      continue;
    }

    if (/^(featured|type:featured)$/i.test(token)) {
      type = "featured";
      continue;
    }

    if (/^(item|items|type:item|type:items)$/i.test(token)) {
      type = "item";
      continue;
    }

    terms.push(token);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return { valid: false, error: "limit must be between 1 and 20" };
  }

  if (issueNumber !== null && (!Number.isInteger(issueNumber) || issueNumber < 1)) {
    return { valid: false, error: "issue number must be a positive integer" };
  }

  if (sinceIssue !== null && (!Number.isInteger(sinceIssue) || sinceIssue < 1)) {
    return { valid: false, error: "since issue must be a positive integer" };
  }

  const textQuery = terms.join(" ").trim();
  if (textQuery && textQuery.length < 2) {
    return { valid: false, error: "text query must be at least 2 characters long" };
  }

  if (textQuery.length > 100) {
    return { valid: false, error: "text query is too long (max 100 characters)" };
  }

  if (!textQuery && issueNumber === null && sinceIssue === null && !type) {
    return { valid: false, error: "Provide text or filters (e.g. #262, since:250, featured)" };
  }

  return {
    valid: true,
    filters: {
      query: textQuery,
      issueNumber,
      sinceIssue,
      type,
      limit,
    },
  };
}

function isValidHttpsUrl(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeObsidianLinkName(rawValue, strictKnownOnly = false) {
  if (!rawValue || typeof rawValue !== "string") {
    return "";
  }

  const cleaned = rawValue
    .trim()
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "")
    .replace(/\|.*$/, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  const fromMap = OBSIDIAN.CANONICAL_LINKS[cleaned.toLowerCase()];
  const canonical = fromMap || cleaned;

  if (strictKnownOnly) {
    const allowed = new Set([
      ...Object.values(OBSIDIAN.CANONICAL_LINKS),
      OBSIDIAN.INDEX_NOTE_NAME,
    ]);
    if (!allowed.has(canonical)) {
      return "";
    }
  }

  return canonical;
}

/**
 * Validate and normalize AI-generated JSON contract for Obsidian notes.
 * Returns normalized value on success, or a descriptive error.
 *
 * @param {any} payload
 * @returns {{ valid: boolean, value?: object, error?: string }}
 */
function validateObsidianIssueNotes(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, error: "payload must be a JSON object" };
  }

  const issue = Number(payload.issue);
  if (!Number.isInteger(issue) || issue < 1) {
    return { valid: false, error: "issue must be a positive integer" };
  }
  const issueTitle =
    typeof payload.issue_title === "string" ? payload.issue_title.trim() : "";

  const date = typeof payload.date === "string" ? payload.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { valid: false, error: "date must be in YYYY-MM-DD format" };
  }

  const sourceUrl =
    typeof payload.source_url === "string" ? payload.source_url.trim() : "";
  if (!isValidHttpsUrl(sourceUrl)) {
    return { valid: false, error: "source_url must be a valid https URL" };
  }

  const tldrRaw = Array.isArray(payload.tldr) ? payload.tldr : [];
  const tldr = tldrRaw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, OBSIDIAN.MAX_TLDR_ITEMS);

  const topicsRaw = Array.isArray(payload.topics) ? payload.topics : [];
  const topics = [];

  for (const topic of topicsRaw.slice(0, OBSIDIAN.MAX_TOPICS)) {
    if (!topic || typeof topic !== "object" || Array.isArray(topic)) {
      return { valid: false, error: "topics entries must be objects" };
    }

    const name = typeof topic.name === "string" ? topic.name.trim() : "";
    const summary =
      typeof topic.summary === "string" ? topic.summary.trim() : "";
    const obsidianLink = normalizeObsidianLinkName(topic.obsidian_link || name);

    if (!name) {
      return { valid: false, error: "topics[].name is required" };
    }
    if (!summary) {
      return { valid: false, error: "topics[].summary is required" };
    }
    if (!obsidianLink) {
      return { valid: false, error: "topics[].obsidian_link is required" };
    }

    topics.push({
      name,
      summary,
      obsidian_link: obsidianLink,
    });
  }

  const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
  const items = [];
  const mocTagsRaw = Array.isArray(payload.moc_tags) ? payload.moc_tags : [];
  const mocTags = [...new Set(
    mocTagsRaw
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean)
      .slice(0, 40)
  )];

  for (const item of itemsRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { valid: false, error: "items entries must be objects" };
    }

    const title = typeof item.title === "string" ? item.title.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const notes = typeof item.notes === "string" ? item.notes.trim() : "";
    const type =
      item.type === "featured" || item.type === "item" ? item.type : "item";
    const recommendation =
      typeof item.recommendation === "string"
        ? (() => {
            const normalized = item.recommendation.trim().toLowerCase();
            if (normalized === "read fully") return "Read fully";
            if (normalized === "reference only") return "Reference only";
            return "Summary sufficient";
          })()
        : "Summary sufficient";
    const recommendationReason =
      typeof item.recommendation_reason === "string"
        ? item.recommendation_reason.trim()
        : "";
    const whyItMatters =
      typeof item.why_it_matters === "string" ? item.why_it_matters.trim() : "";
    const fullContent =
      typeof item.full_content === "string" ? item.full_content.trim() : "";
    const extractionNotes =
      typeof item.extraction_notes === "string"
        ? item.extraction_notes.trim()
        : "";
    const qualityRaw = typeof item.quality === "string" ? item.quality.trim().toLowerCase() : "";
    const quality = ["keep", "review", "drop"].includes(qualityRaw)
      ? qualityRaw
      : "keep";
    const takeaways = Array.isArray(item.takeaways)
      ? item.takeaways
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean)
      : [];
    const entities = Array.isArray(item.entities)
      ? item.entities
          .map((entity) => (typeof entity === "string" ? entity.trim() : ""))
          .filter(Boolean)
      : [];
    const obsidianLinks = Array.isArray(item.obsidian_links)
      ? item.obsidian_links
          .map((link) => normalizeObsidianLinkName(link, true))
          .filter(Boolean)
      : [];
    const itemTags = Array.isArray(item.tags)
      ? [...new Set(
          item.tags
            .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
            .filter(Boolean)
            .slice(0, 20)
        )]
      : [];

    if (!title) {
      return { valid: false, error: "items[].title is required" };
    }
    if (!isValidHttpsUrl(url)) {
      return { valid: false, error: `items[].url must be a valid https URL (${title})` };
    }
    if (!notes) {
      return { valid: false, error: `items[].notes is required (${title})` };
    }

    const uniqueLinks = [...new Set(obsidianLinks)];

    items.push({
      title,
      url,
      type,
      notes,
      recommendation,
      recommendation_reason: recommendationReason,
      why_it_matters: whyItMatters,
      full_content: fullContent,
      extraction_notes: extractionNotes,
      quality,
      takeaways,
      entities,
      tags: itemTags,
      obsidian_links: uniqueLinks,
    });
  }

  const actionItemsRaw = Array.isArray(payload.action_items)
    ? payload.action_items
    : [];
  const actionItems = actionItemsRaw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, OBSIDIAN.MAX_ACTION_ITEMS);

  const relatedNotesRaw = Array.isArray(payload.related_notes)
    ? payload.related_notes
    : [];
  const relatedNotes = relatedNotesRaw
    .map((note) => normalizeObsidianLinkName(note, true))
    .filter(Boolean)
    .slice(0, OBSIDIAN.MAX_RELATED_NOTES);

  return {
    valid: true,
    value: {
      issue,
      issue_title: issueTitle,
      date,
      source_url: sourceUrl,
      moc_tags: mocTags,
      tldr,
      topics,
      items,
      action_items: actionItems,
      related_notes: relatedNotes,
    },
  };
}

module.exports = {
  validateArticleNumber,
  parseCommandArgs,
  parseSearchQuery,
  validateObsidianIssueNotes,
};
