---
name: debug-scraper
description: Debug and fix article scraping issues by diagnosing HTML structure changes, testing selectors, analyzing errors, and updating parsing logic. Use when the user reports scraping failures, "React section not found" errors, article fetch issues, or asks to debug/fix the scraper (e.g., "the scraper isn't working", "fix article parsing", "debug scraping errors")
---

# Debug Scraper Issues

## Overview

This skill helps diagnose and fix issues with the article scraping functionality when the bot fails to extract content from This Week In React newsletter articles.

## Prerequisites

- Project dependencies installed
- Test script available: `{baseDir}/scripts/test-article.js`
- Understanding of Cheerio selectors (jQuery-like syntax)
- Access to the article URLs for manual inspection

## Instructions

Follow this systematic debugging process:

### Step 1: Gather Information

Ask the user:
- What article number is failing?
- What error message are they seeing?
- When did this start happening?
- Does it affect all articles or just specific ones?

### Step 2: Run Diagnostic Test

Execute the test script to get detailed information:

```bash
cd {baseDir}
bun scripts/test-article.js <article-number>
```

Or with Node.js:
```bash
cd {baseDir}
node scripts/test-article.js <article-number>
```

The output will show:
- URL being fetched
- HTTP status
- Available headings in the article
- Whether React section was found
- Any errors encountered

### Step 3: Analyze the Error

Based on the test output, categorize the issue:

#### Issue Type A: "React section not found"

**Diagnosis:**
- Article HTML structure has changed
- Selector no longer matches the heading
- Content uses different heading text

**Next Steps:** Go to Step 4 (HTML Structure Analysis), then use the `migrate-selectors` skill for the actual fix.

#### Issue Type B: "Article not found (404)"

**Diagnosis:**
- Article number doesn't exist
- URL format has changed
- Site restructuring

**Actions:**
```bash
# Verify URL construction
Read: {baseDir}/services/scraper.js
# Look for getArticleUrl() method
```

**Solutions:**
- Verify article number is valid
- Test with known-working article (e.g., 260)
- Check the newsletter site manually
- Update URL construction if site changed

#### Issue Type C: Network/Timeout Errors

**Diagnosis:**
- Network connectivity issues
- Site is slow or down
- Timeout too short
- SSRF protection blocking valid URL

**Actions:**
```bash
# Check timeout configuration
Read: {baseDir}/config/constants.js

# Check URL validation
Read: {baseDir}/utils/urlValidator.js
```

**Solutions:**
- Verify internet connection
- Check site status manually
- Increase timeout if needed
- Review URL validation whitelist

#### Issue Type D: Parse Errors

**Diagnosis:**
- HTML structure changed significantly
- Cheerio selectors returning unexpected data
- Malformed HTML

**Next Steps:** Go to Step 4 (HTML Structure Analysis), then use the `migrate-selectors` skill for the actual fix.

### Step 4: HTML Structure Analysis

For "React section not found" or parse errors:

**Review the article service:**
```bash
Read: {baseDir}/services/articleService.js
```

Key areas to check:
- `_findReactSection()`: Multi-strategy heading finder (3 fallbacks)
- `_extractFeatured()`: Featured article extraction
- `_extractItems()`: Item list extraction (walks siblings until next h2)

**Inspect the selectors:**
```javascript
// Current selector (check actual code)
const reactHeading = $('h2:contains("React")')
```

**Test with different article numbers:**
```bash
bun scripts/test-article.js 260  # Older article
bun scripts/test-article.js 265  # Mid-range
bun scripts/test-article.js 270  # Recent article
```

Look for patterns:
- Do all articles fail or just older/newer ones?
- Are the available headings different?
- Is the heading text consistent?

### Step 5: Fix the Selectors

Based on the HTML analysis, update the selectors in `articleService.js`:

**Common fixes:**

**Fix 1: Heading text changed**
```javascript
// If heading changed from "React ⚛️" to "React"
const reactHeading = $('h2').filter((i, el) => {
  const text = $(el).text();
  return text.includes('React');
});
```

**Fix 2: HTML structure changed**
```javascript
// If heading uses different tag or class
const reactHeading = $('h3.article-heading:contains("React")');
// or
const reactHeading = $('.content-section h2:contains("React")');
```

**Fix 3: Add fallback for older articles**
```javascript
// Try multiple selectors
let reactHeading = $('h2:contains("React ⚛️")');
if (reactHeading.length === 0) {
  reactHeading = $('h2:contains("React")'); // Fallback
}
if (reactHeading.length === 0) {
  throw new Error("React section not found in article");
}
```

### Step 6: Test the Fix

After making changes:

**Run test script again:**
```bash
bun scripts/test-article.js <article-number>
```

**Test multiple articles:**
```bash
# Test a range to ensure fix works for all
bun scripts/test-article.js 260
bun scripts/test-article.js 265
bun scripts/test-article.js 270
```

**Test in development:**
```bash
bun dev
```
Then use the `/article` command in Telegram

### Step 7: Improve Error Messages

If the error messages aren't helpful, enhance them:

```javascript
// In articleService.js
if (reactHeading.length === 0) {
  // Log available headings for debugging
  const headings = [];
  $('h2, h3').each((i, el) => {
    headings.push($(el).text().trim());
  });

  console.error('Available headings:', headings);
  throw new Error(
    `React section not found. Available headings: ${headings.slice(0, 5).join(', ')}`
  );
}
```

### Step 8: Add Better Logging

Temporarily add debug logging to understand what's happening:

```javascript
// In articleService.js getArticle() method
console.log('Fetching article from:', url);
console.log('HTML length:', $.html().length);
console.log('Found headings:', $('h2').length);

const reactHeading = $('h2:contains("React")');
console.log('React heading found:', reactHeading.length > 0);
```

**Remember to remove debug logging after fixing the issue.**

### Step 9: Consider Edge Cases

**For comprehensive solution, handle:**

**Old articles (different structure):**
```javascript
async getArticle(articleNumber) {
  // Try new structure first
  try {
    return await this.parseNewStructure($, articleNumber);
  } catch (err) {
    // Fallback to old structure
    return await this.parseOldStructure($, articleNumber);
  }
}
```

**Missing sections:**
```javascript
// Gracefully handle missing featured section
const featuredSection = reactHeading.next('h3:contains("Featured")');
if (featuredSection.length === 0) {
  console.log('No featured section found, skipping...');
} else {
  // Extract featured articles
}
```

### Step 10: Document the Fix

After fixing:
- Comment why the change was needed
- Note which articles it affects
- Update any relevant documentation

```javascript
// Fixed 2024-12: Site changed heading from "React ⚛️" to "React"
// Works for articles #260+
const reactHeading = $('h2:contains("React")');
```

## Output Format

Provide a diagnostic report and solution:

```markdown
🔍 Scraper Debug Report

**Issue:** React section not found for article #265

**Diagnosis:**
- ✅ URL is valid
- ✅ HTTP fetch successful
- ❌ React heading selector not matching

**Root Cause:**
The site changed heading format from "React ⚛️" to "React" for articles after #264.

**Available Headings Found:**
1. "This Week's Updates"
2. "React"  ← Target section
3. "React Native"
4. "TypeScript"

**Fix Applied:**
Updated selector in services/articleService.js:45
- Old: `$('h2:contains("React ⚛️")')`
- New: `$('h2').filter(...text.includes('React')...)`

**Testing:**
✅ Article 260 - Working
✅ Article 265 - Working
✅ Article 270 - Working

**Files Modified:**
- services/articleService.js:45-52

💡 **Recommendation:** The fix adds a fallback selector that will work for both old and new article formats.
```

## Error Handling

**If test script won't run:**
- Check dependencies: `ls {baseDir}/node_modules`
- Verify script exists: `ls {baseDir}/scripts/test-article.js`
- Try Node.js if Bun fails: `node scripts/test-article.js`

**If cannot determine root cause:**
- Offer to inspect raw HTML manually
- Suggest checking the newsletter site directly
- Recommend reaching out to user with findings so far

**If fix doesn't work:**
- Revert changes
- Try alternative selectors
- Consider more comprehensive rewrite

## Examples

### Example 1: Heading Text Changed

**Test Output:**
```
Available headings:
- "Weekly Updates"
- "React"  ← Changed from "React ⚛️"
- "React Native"
```

**Fix:**
```javascript
// More flexible selector
const reactHeading = $('h2').filter((i, el) => {
  return $(el).text().toLowerCase().includes('react');
});
```

### Example 2: HTML Structure Changed

**Old Structure:**
```html
<h2>React ⚛️</h2>
<ul>
  <li><a href="...">Article</a></li>
</ul>
```

**New Structure:**
```html
<div class="section">
  <h2>React ⚛️</h2>
  <div class="articles">
    <a href="...">Article</a>
  </div>
</div>
```

**Fix:**
```javascript
// Update selector to match new structure
const articles = reactHeading
  .parent('.section')
  .find('.articles a');
```

### Example 3: Timeout Issue

**Error:** "timeout of 10000ms exceeded"

**Fix:**
```javascript
// In config/constants.js
module.exports = {
  HTTP_TIMEOUT: 15000, // Increased from 10000
  // ...
};
```

## Related Skills

After diagnosing the issue, use the **`migrate-selectors`** skill for a guided process to update Cheerio selectors with backward compatibility across article ranges.

## Code References

- Article parsing: `{baseDir}/services/articleService.js`
- Scraper logic: `{baseDir}/services/scraper.js`
- Test script: `{baseDir}/scripts/test-article.js`
- URL validation: `{baseDir}/utils/urlValidator.js`
- Timeout config: `{baseDir}/config/constants.js`
