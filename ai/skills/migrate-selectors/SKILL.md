---
name: migrate-selectors
description: Update Cheerio selectors in articleService.js when the This Week In React newsletter changes its HTML structure, while maintaining backward compatibility with older articles. Use when scraping breaks due to site changes, new article format detected, selectors need updating, or after diagnosing an issue with debug-scraper (e.g., "update selectors", "new article format", "fix parsing for new layout", "site structure changed")
---

# Migrate Selectors

## Overview

The newsletter site periodically changes its HTML structure, breaking the scraper. This skill walks through updating the Cheerio selectors in `articleService.js` while ensuring older articles still parse correctly.

This is the most common maintenance task for this project.

## Prerequisites

- Run `debug-scraper` skill first if you haven't already diagnosed which selectors are broken
- Have at least one failing article number and one working article number
- Familiarity with Cheerio (jQuery-like syntax for server-side HTML)

## Instructions

### Step 1: Establish Baseline

Identify which articles work and which don't:

```bash
cd {baseDir}

# Test a known-working older article
bun scripts/test-article.js 260

# Test the failing article
bun scripts/test-article.js <failing-number>

# Test the latest article
bun scripts/test-article.js <latest-number>
```

Record the results:
- Which article numbers work?
- Which fail?
- Where's the boundary (last working → first failing)?

### Step 2: Compare HTML Structure

Fetch raw HTML from both a working and failing article to understand what changed.

Add a temporary debug script or use the existing test script output. Key things to compare:

**Section headings:**
- Old format: `<h2>React ⚛️</h2>` vs new: `<h2>React</h2>` vs `<h3 class="section-title">React</h3>`
- Check tag name (h2 vs h3), text content, class names, emoji presence

**Article lists:**
- Old format: `<ul><li><a>...</a></li></ul>` vs new: `<div class="links"><a>...</a></div>`
- Check container element, link nesting depth, surrounding structure

**Featured article:**
- Old format: link directly after heading vs wrapped in a `<div>` or `<section>`

Focus on `_findReactSection()`, `_extractFeatured()`, and `_extractItems()` in `{baseDir}/services/articleService.js`.

### Step 3: Map Old Selectors to New Structure

Read the current selectors:

```bash
Read: {baseDir}/services/articleService.js
```

Document what each method currently does:

| Method | Current Selector | Works For | Broken For |
|--------|-----------------|-----------|------------|
| `_findReactSection` | Strategy 1: h2 with "react" text | #260-#270 | #271+ |
| `_extractFeatured` | `reactHeading.nextAll("a").first()` | #260-#270 | #271+ |
| `_extractItems` | Walks siblings, finds `ul > li > a` | #260-#270 | #271+ |

Then document what the new HTML looks like and what selectors would match it.

### Step 4: Update _findReactSection

This method uses three strategies with fallbacks. When updating:

**Rule: Add new strategies BEFORE existing ones, don't remove old ones.**

The current order is:
1. h2 containing "react" (case-insensitive, excluding "react-native")
2. h2 with ⚛️ emoji
3. Any heading (h1-h3) with "react"

If the new format uses a different structure, add it as Strategy 0:

```javascript
_findReactSection($) {
  // Strategy 0: New format (added YYYY-MM for articles #XXX+)
  let heading = $('NEW_SELECTOR').first();
  if (heading.length) {
    console.log("Found React section using Strategy 0 (new format)");
    return heading;
  }

  // Strategy 1: h2 with "React" (existing — keep for older articles)
  heading = $("h2").filter((_, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes("react") && !text.includes("react-native");
  }).first();
  // ... rest unchanged
}
```

**Important:** Always exclude "react-native" from React section matching.

### Step 5: Update _extractFeatured

This method tries three strategies to find the featured link after the React heading:
1. `reactHeading.nextAll("a").first()`
2. First link in next `<p>`
3. First link in next `<div>`

If the new structure wraps the featured article differently:

```javascript
_extractFeatured($, reactHeading, baseUrl) {
  let featuredLink = null;

  // Strategy 0: New format (added YYYY-MM)
  // e.g., featured is in a specific container
  featuredLink = reactHeading.nextAll(".featured-wrapper").find("a").first();

  // Strategy 1: First link after heading (existing)
  if (!featuredLink || !featuredLink.length) {
    featuredLink = reactHeading.nextAll("a").first();
  }

  // ... rest of strategies unchanged
}
```

### Step 6: Update _extractItems

This method walks DOM siblings from the React heading until it hits the next major section (h1/h2). It extracts links from `<ul>` elements.

Key stop conditions (preserve these):
- Stops at h1 or h2 tags
- Stops if heading text contains "react-native", "other", or "fun"
- Max 100 iterations (safety limit)
- Skips items with 💸 and 🗓 emojis (from `ARTICLES_TO_SKIP` constant)
- Marks items with 🐦, 🎥, 📦 as "AI skipped" (from `ARTICLES_TO_SKIP_AI`)

If the new format uses a different list structure:

```javascript
// If articles are now in <div> containers instead of <ul><li>
if (tag === "div" && current.hasClass("article-list")) {
  current.find("a").each((_, a) => {
    // Same link extraction logic as the ul handler
  });
}
```

**Critical: Keep the existing `ul` handler for backward compatibility.** Add the new handler alongside it, not replacing it.

### Step 7: Test Across Article Range

After making changes, test comprehensively:

```bash
# Oldest format you care about
bun scripts/test-article.js 250

# Middle of known-working range
bun scripts/test-article.js 260

# Last article before format change
bun scripts/test-article.js <boundary - 1>

# First article with new format
bun scripts/test-article.js <boundary>

# Latest article
bun scripts/test-article.js <latest>
```

**All must pass.** If an older article breaks, your new strategy is too broad and is matching incorrectly. Make the new selectors more specific.

### Step 8: Test with Live Bot

```bash
bun dev
```

In Telegram, test:
- `/article <old-number>` — should still work
- `/article <new-number>` — should now work
- `/digest <new-number>` — should generate AI digest (if OpenAI configured)

### Step 9: Add a Comment Documenting the Change

At the top of the modified method or near the new strategy:

```javascript
// Strategy 0: New section format (YYYY-MM, articles #XXX+)
// Site changed from <old structure> to <new structure>
// See: https://thisweekinreact.com/newsletter/XXX
```

This helps the next person understand why multiple strategies exist.

### Step 10: Consider Edge Cases

Before finishing, verify:

- [ ] Special/announcement articles still handled (they throw ParsingError, not crash)
- [ ] Articles with no featured section still work (returns null)
- [ ] Articles with empty item lists still work (returns empty array)
- [ ] Very old articles (different format entirely) don't crash
- [ ] The `_extractItems` stop condition still works (stops at next h1/h2)
- [ ] URL validation still applies to all extracted links
- [ ] ARTICLES_TO_SKIP and ARTICLES_TO_SKIP_AI filters still work

## Output Format

```
Selector Migration Report

Trigger: <what broke and when>
Articles affected: #XXX and newer

Changes in services/articleService.js:

_findReactSection:
  Added: Strategy 0 — <description of new selector>
  Kept:  Strategy 1-3 (for articles #1-#XXX)

_extractFeatured:
  Added: <new strategy or "no changes needed">
  Kept:  Existing strategies

_extractItems:
  Added: <new list handler or "no changes needed">
  Kept:  Existing ul handler

Test Results:
  Article #250: OK (old format)
  Article #260: OK (old format)
  Article #XXX: OK (boundary)
  Article #YYY: OK (new format)
  Article #ZZZ: OK (latest)

Backward compatible: Yes
```

## Error Handling

**If you can't determine the new HTML structure:**
- Fetch the raw HTML and inspect manually
- Look at the newsletter in a browser with DevTools
- Ask the user to provide a screenshot of the article page

**If old and new formats conflict (same selector matches wrong content):**
- Use article number ranges to choose strategy
- Check for unique attributes (classes, data attributes) in the new format
- Use more specific selectors that only match the intended format

**If multiple format changes stacked (3+ different layouts):**
- Consider a strategy registry pattern:
```javascript
_findReactSection($, articleNumber) {
  const strategies = articleNumber > 300
    ? [this._strategyV3, this._strategyV2, this._strategyV1]
    : [this._strategyV2, this._strategyV1];
  // Try each strategy in order
}
```
- But only if needed — don't over-engineer for hypothetical formats

## Code References

- Article parsing (main file to modify): `{baseDir}/services/articleService.js`
- Section finding: `_findReactSection()` method
- Featured extraction: `_extractFeatured()` method
- Items extraction: `_extractItems()` method
- Skip filters: `ARTICLES_TO_SKIP`, `ARTICLES_TO_SKIP_AI` in `{baseDir}/config/constants.js`
- URL validation: `validateArticleUrl()`, `validateNestedUrl()` in `{baseDir}/utils/urlValidator.js`
- Test script: `{baseDir}/scripts/test-article.js`
