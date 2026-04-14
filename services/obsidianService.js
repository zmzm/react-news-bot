const { OBSIDIAN } = require("../config/constants");
const { ValidationError } = require("../utils/errors");
const { validateObsidianIssueNotes } = require("../utils/validators");
const scraper = require("./scraper");
const fs = require("fs").promises;
const path = require("path");

class ObsidianService {
  /**
   * Build Obsidian notes payload directly from parsed issue links (no AI digest).
   * @param {object} reactSectionData
   * @param {Function|null} progressCallback
   * @returns {Promise<object>}
   */
  async generateIssueNotesFromReactSection(reactSectionData, progressCallback = null) {
    if (!reactSectionData || typeof reactSectionData !== "object") {
      throw new ValidationError("reactSectionData must be an object");
    }

    const issueNumber = Number(reactSectionData.issueNumber);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) {
      throw new ValidationError("reactSectionData.issueNumber must be a positive integer");
    }

    const sourceUrl =
      typeof reactSectionData.url === "string" ? reactSectionData.url.trim() : "";
    if (!sourceUrl) {
      throw new ValidationError("reactSectionData.url is required");
    }

    const issueDate =
      typeof reactSectionData.publishedDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(reactSectionData.publishedDate)
        ? reactSectionData.publishedDate
        : new Date().toISOString().slice(0, 10);
    const issueTitle =
      typeof reactSectionData.title === "string" ? reactSectionData.title.trim() : "";

    const links = [];
    if (
      reactSectionData.featured &&
      typeof reactSectionData.featured === "object" &&
      reactSectionData.featured.url &&
      !String(reactSectionData.featured.title || "").includes("(AI skipped)")
    ) {
      links.push({ ...reactSectionData.featured, type: "featured" });
    }
    if (Array.isArray(reactSectionData.items)) {
      reactSectionData.items.forEach((item) => {
        if (
          item &&
          typeof item === "object" &&
          item.url &&
          !String(item.title || "").includes("(AI skipped)")
        ) {
          links.push({ ...item, type: "item" });
        }
      });
    }

    const items = [];
    for (let i = 0; i < links.length; i += 1) {
      const link = links[i];
      if (progressCallback) {
        await progressCallback(
          `📥 Obsidian #${issueNumber}: fetching article ${i + 1}/${links.length}...`
        );
      }

      let notes = "";
      try {
        notes = (await scraper.fetchExternalMarkdown(link.url)).trim();
      } catch (err) {
        notes = `[Unable to fetch content: ${err.message}]`;
      }

      items.push({
        title:
          typeof link.title === "string" && link.title.trim()
            ? link.title.trim()
            : "Untitled article",
        url: link.url,
        type: link.type === "featured" ? "featured" : "item",
        notes: notes || "Unable to extract content from this article.",
        takeaways: [],
        recommendation: "Summary sufficient",
        recommendation_reason: "",
        entities: [],
        tags: [],
        obsidian_links: [],
      });
    }

    const payload = {
      issue: issueNumber,
      issue_title: issueTitle,
      date: issueDate,
      source_url: sourceUrl,
      moc_tags: [],
      tldr: [],
      topics: [],
      items,
      action_items: [],
      related_notes: [],
    };

    return this.validateIssueNotes(payload);
  }

  /**
   * Enrich AI digest-style notes with full cleaned article text.
   * Keeps summary/takeaways/recommendation intact and appends full content separately.
   * @param {object} payload
   * @param {Function|null} progressCallback
   * @returns {Promise<object>}
   */
  async enrichIssueNotesWithFullContent(payload, progressCallback = null) {
    const note = this.validateIssueNotes(payload);
    const items = [];

    for (let i = 0; i < note.items.length; i += 1) {
      const item = note.items[i];
      if (progressCallback) {
        await progressCallback(
          `📥 Obsidian #${note.issue}: fetching article ${i + 1}/${note.items.length}...`
        );
      }

      let fullContent = "";
      let extractionNotes = "";
      try {
        fullContent = (await scraper.fetchExternalMarkdown(item.url)).trim();
      } catch (err) {
        fullContent = "";
        extractionNotes = `Content extraction failed: ${err.message}`;
      }

      items.push({
        ...item,
        full_content: fullContent,
        extraction_notes:
          extractionNotes || (item.extraction_notes ? item.extraction_notes : ""),
        quality:
          item.quality === "keep" || item.quality === "review" || item.quality === "drop"
            ? item.quality
            : "keep",
      });
    }

    return this.validateIssueNotes({
      ...note,
      items,
    });
  }

  /**
   * Validate and normalize AI output contract for Obsidian notes.
   * @param {object} payload - Raw AI JSON payload
   * @returns {object} - Normalized payload
   */
  validateIssueNotes(payload) {
    const validated = validateObsidianIssueNotes(payload);
    if (!validated.valid) {
      throw new ValidationError(
        `Invalid Obsidian issue notes payload: ${validated.error}`
      );
    }

    return validated.value;
  }

  /**
   * Build deterministic filename for a note.
   * @param {object} payload - Normalized issue note payload
   * @returns {string}
   */
  getIssueNoteFileName(payload) {
    const normalized = this.validateIssueNotes(payload);
    return `${normalized.date} - TWIR #${normalized.issue}.md`;
  }

  /**
   * Render normalized issue payload into Obsidian markdown.
   * @param {object} payload - AI JSON payload
   * @returns {string}
   */
  renderIssueMarkdown(payload) {
    const note = this.validateIssueNotes(payload);
    const featuredItems = note.items.filter((item) => item.type === "featured");
    const regularItems = note.items.filter((item) => item.type !== "featured");
    const lines = [];

    lines.push("---");
    lines.push(`type: ${OBSIDIAN.DEFAULT_TYPE}`);
    lines.push(`issue: ${note.issue}`);
    lines.push(`date: ${note.date}`);
    lines.push(`source: ${note.source_url}`);
    this._pushYamlList(lines, "tags", this._buildMocTags(note));
    lines.push(`status: ${OBSIDIAN.DEFAULT_STATUS}`);
    lines.push(`topics: [${note.topics.map((topic) => topic.obsidian_link).join(", ")}]`);
    lines.push("---");
    lines.push("");
    lines.push(`# This Week in React #${note.issue}`);
    lines.push("");
    lines.push("## TL;DR");
    if (note.tldr.length > 0) {
      note.tldr.forEach((item) => lines.push(`- ${item}`));
    } else {
      lines.push("- No summary generated.");
    }
    lines.push("");
    lines.push("## Main Topics");
    if (note.topics.length > 0) {
      note.topics.forEach((topic) => {
        lines.push(`- ${this._wiki(topic.obsidian_link)} - ${topic.summary}`);
      });
    } else {
      lines.push("- No topics extracted.");
    }
    lines.push("");
    lines.push("## Featured");
    if (featuredItems.length > 0) {
      featuredItems.forEach((item, idx) => {
        lines.push(`### Item ${idx + 1}: [${item.title}](${item.url})`);
        lines.push(`Summary:\n${item.notes}`);
        lines.push("");
        lines.push("Key takeaways:");
        const takeaways = this._getTakeaways(item);
        if (takeaways.length > 0) {
          takeaways.forEach((entry) => lines.push(`- ${entry}`));
        } else {
          lines.push("- No key takeaways extracted.");
        }
        lines.push("");
        lines.push(
          `Recommendation: ${item.recommendation || "Summary sufficient"}${this._formatRecommendationReason(item)}`
        );
        lines.push("");
      });
    } else {
      lines.push("- No featured item extracted.");
    }
    lines.push("");
    lines.push("## Items");
    if (regularItems.length > 0) {
      regularItems.forEach((item, idx) => {
        lines.push(`### Item ${idx + 1}: [${item.title}](${item.url})`);
        lines.push(`Summary:\n${item.notes}`);
        lines.push("");
        lines.push("Key takeaways:");
        const takeaways = this._getTakeaways(item);
        if (takeaways.length > 0) {
          takeaways.forEach((entry) => lines.push(`- ${entry}`));
        } else {
          lines.push("- No key takeaways extracted.");
        }
        lines.push("");
        lines.push(
          `Recommendation: ${item.recommendation || "Summary sufficient"}${this._formatRecommendationReason(item)}`
        );
        lines.push("");
      });
    } else {
      lines.push("- No items extracted.");
    }
    lines.push("");
    lines.push("## Action Items");
    if (note.action_items.length > 0) {
      note.action_items.forEach((item) => lines.push(`- ${item}`));
    } else {
      lines.push("- No action items.");
    }
    lines.push("");
    lines.push("## Related Notes");
    const related = this._buildRelatedNotes(note);
    related.forEach((name) => lines.push(`- ${this._wiki(name)}`));

    return lines.join("\n");
  }

  /**
   * Render MOC note for issue bundle.
   * @param {object} payload
   * @param {Array<{index:number,title:string,fileBaseName:string,type:string}>} itemDescriptors
   * @returns {string}
   */
  renderIssueMocMarkdown(payload, itemDescriptors) {
    const note = this.validateIssueNotes(payload);
    const lines = [];

    lines.push("---");
    lines.push(`type: ${OBSIDIAN.DEFAULT_TYPE}`);
    lines.push(`issue: ${note.issue}`);
    lines.push(`date: ${note.date}`);
    lines.push(`source: ${note.source_url}`);
    this._pushYamlList(lines, "tags", this._buildMocTags(note));
    lines.push(`status: ${OBSIDIAN.DEFAULT_STATUS}`);
    lines.push(`topics: [${note.topics.map((topic) => topic.obsidian_link).join(", ")}]`);
    lines.push("---");
    lines.push("");
    lines.push(`# This Week in React #${note.issue} (MOC)`);
    lines.push("");
    lines.push("## TL;DR");
    if (note.tldr.length > 0) {
      note.tldr.forEach((item) => lines.push(`- ${item}`));
    } else {
      lines.push("- No summary generated.");
    }
    lines.push("");
    lines.push("## Main Topics");
    if (note.topics.length > 0) {
      note.topics.forEach((topic) => {
        lines.push(`- ${this._wiki(topic.obsidian_link)} - ${topic.summary}`);
      });
    } else {
      lines.push("- No topics extracted.");
    }
    lines.push("");
    lines.push("## Articles");
    if (itemDescriptors.length > 0) {
      itemDescriptors.forEach((item) => {
        const prefix = item.type === "featured" ? "⭐ " : "";
        lines.push(
          `- ${prefix}Item ${item.index}: [[articles/${item.fileBaseName}|${item.title}]]`
        );
      });
    } else {
      lines.push("- No items extracted.");
    }
    lines.push("");
    lines.push("## Action Items");
    if (note.action_items.length > 0) {
      note.action_items.forEach((item) => lines.push(`- ${item}`));
    } else {
      lines.push("- No action items.");
    }
    lines.push("");
    lines.push("## Related Notes");
    const related = this._buildRelatedNotes(note);
    related.forEach((name) => lines.push(`- ${this._wiki(name)}`));

    return lines.join("\n");
  }

  /**
   * Render single item article note in digest-like structure.
   * @param {object} payload
   * @param {object} item
   * @param {number} index
   * @param {string} mocName
   * @returns {string}
   */
  renderIssueItemMarkdown(payload, item, index, mainNoteBaseName) {
    const note = this.validateIssueNotes(payload);
    const lines = [];

    lines.push("---");
    lines.push("type: twir-item");
    lines.push(`issue: ${note.issue}`);
    lines.push(`item: ${index}`);
    lines.push(`item_type: ${item.type || "item"}`);
    lines.push(`date: ${note.date}`);
    lines.push(`source: ${item.url}`);
    this._pushYamlList(
      lines,
      "tags",
      this._buildItemTags(note, item)
    );
    lines.push(`status: ${OBSIDIAN.DEFAULT_STATUS}`);
    lines.push(
      `quality: ${
        item.quality === "keep" || item.quality === "review" || item.quality === "drop"
          ? item.quality
          : "keep"
      }`
    );
    lines.push("---");
    lines.push("");
    lines.push(`[[${mainNoteBaseName}|Index]]`);
    lines.push("");
    lines.push(`# Item ${index}: ${item.title}`);
    lines.push("");
    lines.push(`Source: [${item.url}](${item.url})`);
    lines.push("");
    lines.push("Summary:");
    lines.push(item.notes || "Summary not available.");
    lines.push("");
    lines.push("Key takeaways:");
    const takeaways = this._getTakeaways(item);
    if (takeaways.length > 0) {
      takeaways.forEach((entry) => lines.push(`- ${entry}`));
    } else {
      lines.push("- No key takeaways extracted.");
    }
    lines.push("");
    lines.push(
      `Recommendation:\n${item.recommendation || "Summary sufficient"}${this._formatRecommendationReason(item)}`
    );
    if (item.why_it_matters) {
      lines.push("");
      lines.push("Why it matters:");
      lines.push(item.why_it_matters);
    }
    lines.push("");
    lines.push("Content:");
    lines.push(item.full_content || "Content not available.");
    if (item.extraction_notes) {
      lines.push("");
      lines.push("Notes:");
      lines.push(item.extraction_notes);
    }
    if (item.obsidian_links && item.obsidian_links.length > 0) {
      lines.push("");
      lines.push(
        `Related notes: ${item.obsidian_links
          .map((link) => this._wiki(link))
          .join(", ")}`
      );
    }

    return lines.join("\n");
  }

  /**
   * Save markdown note into Obsidian vault.
   * @param {string} vaultPath - Absolute path to Obsidian vault
   * @param {object} payload - AI JSON payload
   * @param {object} options
   * @param {boolean} options.overwrite - Overwrite existing file
   * @param {string} options.subdir - Subdirectory inside vault
   * @returns {Promise<{filePath: string, fileName: string, existed: boolean}>}
   */
  async saveIssueNote(vaultPath, payload, options = {}) {
    const normalized = this.validateIssueNotes(payload);
    const markdown = this.renderIssueMarkdown(normalized);
    const overwrite = options.overwrite === true;
    const subdir = options.subdir || "TWIR";

    if (!vaultPath || typeof vaultPath !== "string") {
      throw new ValidationError("vaultPath is required");
    }

    const resolvedVaultPath = path.resolve(vaultPath.trim());
    let vaultStats;
    try {
      vaultStats = await fs.stat(resolvedVaultPath);
    } catch {
      throw new ValidationError(
        `Obsidian vault path does not exist: ${resolvedVaultPath}`
      );
    }

    if (!vaultStats.isDirectory()) {
      throw new ValidationError(
        `Obsidian vault path is not a directory: ${resolvedVaultPath}`
      );
    }

    const noteDir = path.join(resolvedVaultPath, subdir);
    await fs.mkdir(noteDir, { recursive: true });

    const fileName = this.getIssueNoteFileName(normalized);
    const filePath = path.join(noteDir, fileName);

    let existed = false;
    try {
      await fs.access(filePath);
      existed = true;
    } catch {
      existed = false;
    }

    if (existed && !overwrite) {
      throw new ValidationError(
        `Note already exists: ${filePath}. Re-run with overwrite enabled to replace it.`
      );
    }

    await fs.writeFile(filePath, `${markdown}\n`, "utf8");

    return {
      filePath,
      fileName,
      existed,
    };
  }

  /**
   * Save a full issue bundle:
   * vault/TWIR/<issue>/MOC.md
   * vault/TWIR/<issue>/articles/<item>.md
   *
   * @param {string} vaultPath
   * @param {object} payload
   * @param {object} options
   * @param {boolean} options.overwrite
   * @param {string} options.subdir
   * @returns {Promise<{issueDir:string,mocPath:string,itemPaths:string[],existed:boolean}>}
   */
  async saveIssueBundle(vaultPath, payload, options = {}) {
    const normalized = this.validateIssueNotes(payload);
    const overwrite = options.overwrite === true;
    const subdir = options.subdir || "";

    if (!vaultPath || typeof vaultPath !== "string") {
      throw new ValidationError("vaultPath is required");
    }

    const resolvedVaultPath = path.resolve(vaultPath.trim());
    let vaultStats;
    try {
      vaultStats = await fs.stat(resolvedVaultPath);
    } catch {
      throw new ValidationError(
        `Obsidian vault path does not exist: ${resolvedVaultPath}`
      );
    }

    if (!vaultStats.isDirectory()) {
      throw new ValidationError(
        `Obsidian vault path is not a directory: ${resolvedVaultPath}`
      );
    }

    const rootDir = path.join(resolvedVaultPath, subdir);
    const issueDir = path.join(rootDir, String(normalized.issue));
    const articlesDir = path.join(issueDir, "articles");
    await fs.mkdir(articlesDir, { recursive: true });

    const mainNoteBaseName = this._buildMainNoteFileBaseName(normalized);
    const mocPath = path.join(issueDir, `${mainNoteBaseName}.md`);
    let existed = false;
    try {
      await fs.access(mocPath);
      existed = true;
    } catch {
      existed = false;
    }

    if (existed && !overwrite) {
      throw new ValidationError(
        `Issue bundle already exists: ${issueDir}. Re-run with overwrite enabled to replace it.`
      );
    }

    if (overwrite) {
      await this._removeExistingArticleMarkdownFiles(articlesDir);
    }

    const itemDescriptors = normalized.items.map((item, idx) => {
      const index = idx + 1;
      const fileBaseName = this._buildItemFileBaseName(index, item.title);
      return {
        item,
        index,
        fileBaseName,
        type: item.type || "item",
        title: item.title,
      };
    });

    const itemPaths = [];
    for (const descriptor of itemDescriptors) {
      const itemMarkdown = this.renderIssueItemMarkdown(
        normalized,
        descriptor.item,
        descriptor.index,
        mainNoteBaseName
      );
      const itemPath = path.join(articlesDir, `${descriptor.fileBaseName}.md`);
      await fs.writeFile(itemPath, `${itemMarkdown}\n`, "utf8");
      itemPaths.push(itemPath);
    }

    const mocMarkdown = this.renderIssueMocMarkdown(
      normalized,
      itemDescriptors.map(({ index, title, fileBaseName, type }) => ({
        index,
        title,
        fileBaseName,
        type,
      }))
    );
    await fs.writeFile(mocPath, `${mocMarkdown}\n`, "utf8");

    return {
      issueDir,
      mocPath,
      mainNoteBaseName,
      itemPaths,
      existed,
    };
  }

  async _removeExistingArticleMarkdownFiles(articlesDir) {
    let entries = [];
    try {
      entries = await fs.readdir(articlesDir, { withFileTypes: true });
    } catch {
      return;
    }

    const deletions = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => fs.unlink(path.join(articlesDir, entry.name)));

    await Promise.all(deletions);
  }

  _buildRelatedNotes(note) {
    const merged = [
      ...note.related_notes,
      ...note.topics.map((topic) => topic.obsidian_link),
      OBSIDIAN.INDEX_NOTE_NAME,
    ];
    return [...new Set(merged)];
  }

  _getTakeaways(item) {
    if (Array.isArray(item.takeaways) && item.takeaways.length > 0) {
      return item.takeaways
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
    }

    if (Array.isArray(item.entities) && item.entities.length > 0) {
      return item.entities
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
    }

    return [];
  }

  _buildItemFileBaseName(index, title) {
    const sanitizedTitle = String(title || "Untitled")
      .replace(/[\/\\:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const compact = sanitizedTitle || "Untitled";
    const prefix = String(index).padStart(2, "0");
    return `${prefix} - ${compact}`.slice(0, 140);
  }

  _formatRecommendationReason(item) {
    const reason =
      item &&
      typeof item.recommendation_reason === "string" &&
      item.recommendation_reason.trim()
        ? item.recommendation_reason.trim()
        : "";
    return reason ? ` (${reason})` : "";
  }

  _buildMainNoteFileBaseName(note) {
    return `${note.date}-TWIR-${note.issue}`;
  }

  _buildMocTags(note) {
    if (Array.isArray(note.moc_tags) && note.moc_tags.length > 0) {
      return note.moc_tags.map((tag) => this._normalizeTagToken(tag)).filter(Boolean);
    }
    return OBSIDIAN.DEFAULT_TAGS
      .map((tag) => this._normalizeTagToken(tag))
      .filter(Boolean);
  }

  _buildItemTags(note, item) {
    const derived = Array.isArray(item.tags) ? item.tags : [];
    return [
      ...new Set(
        [...derived]
          .map((tag) => this._normalizeTagToken(tag))
          .filter(Boolean)
      ),
    ];
  }

  _pushYamlList(lines, key, values) {
    lines.push(`${key}:`);
    (Array.isArray(values) ? values : []).forEach((value) => {
      const safe = String(value).replace(/"/g, '\\"');
      lines.push(`  - "${safe}"`);
    });
  }

  _normalizeTagToken(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    // Obsidian tags in this project should be single-token (no spaces, no dots).
    // Keep alnum + hyphen/underscore; collapse whitespace by removing it.
    return raw
      .replace(/\s+/g, "")
      .replace(/[^\p{L}\p{N}_-]/gu, "")
      .trim();
  }

  _wiki(value) {
    return `[[${value}]]`;
  }
}

module.exports = new ObsidianService();
