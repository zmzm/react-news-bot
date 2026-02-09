---
name: test-article
description: Test article scraping functionality by running the test script for specific article numbers, diagnosing scraping issues, and analyzing HTML structure problems. Use when the user wants to test scraping, validate article fetching, or troubleshoot specific article issues (e.g., "test article 260", "check if scraping works", "validate article fetching")
---

# Test Article Scraping

## Overview

This skill helps you test and validate the article scraping functionality for the This Week In React bot. It runs diagnostic tests for specific articles, analyzes HTML structure, and identifies why scraping might be failing.

## Prerequisites

- Project dependencies must be installed (`node_modules/` exists)
- Test script exists at `{baseDir}/scripts/test-article.js`
- Valid article number to test (positive integer)

## Instructions

Follow these steps to test article scraping:

### Step 1: Identify the Article

Ask the user which article number they want to test, or suggest testing a recent article number (e.g., 260-270 range).

### Step 2: Run the Test Script

Execute the test script with the article number:

```bash
cd {baseDir}
bun scripts/test-article.js <article-number>
```

If Bun is not available, try Node.js:

```bash
cd {baseDir}
node scripts/test-article.js <article-number>
```

### Step 3: Analyze the Output

The test script provides detailed diagnostic information:

- **URL validation status**: Whether the article URL is valid
- **HTTP fetch status**: Whether the HTML was retrieved successfully
- **Available headings**: All H2 headings found in the article
- **React section status**: Whether the React section was found
- **Error details**: Any errors encountered during the process

### Step 4: Interpret Results

Based on the output, determine the issue:

**If "React section not found":**
- The article HTML structure may have changed
- Check the available headings in the output
- The React section might use a different heading format
- Older articles might have different HTML structure

**If "Article not found (404)":**
- The article number doesn't exist yet
- Check if the URL format is correct
- Try a different, known-working article number

**If network/timeout errors:**
- Check internet connectivity
- The site might be experiencing issues
- Timeout settings may need adjustment

**If parse errors:**
- HTML structure has changed significantly
- Selectors in `articleService.js` need updating
- Consider inspecting the raw HTML

### Step 5: Provide Recommendations

Based on the diagnosis, suggest next steps:

1. **For HTML structure changes:**
   - Inspect `{baseDir}/services/articleService.js`
   - Update Cheerio selectors to match new structure
   - Test with multiple article numbers to confirm

2. **For missing articles:**
   - Verify the article number is valid
   - Try testing with a known-working article (e.g., 260)
   - Check the newsletter site manually

3. **For network issues:**
   - Review timeout settings in `{baseDir}/config/constants.js`
   - Check URL validation in `{baseDir}/utils/urlValidator.js`
   - Test network connectivity

### Step 6: Offer Additional Testing

Optionally offer to:
- Test multiple article numbers to find patterns
- Inspect the scraper code for potential issues
- Run the bot in development mode to test the `/article` command
- Check the site's HTML directly for structural changes

## Output Format

Provide a clear diagnostic report:

```
🔍 Testing Article #<number>

✅ URL: <url>
✅ HTTP Status: 200 OK
✅ HTML fetched successfully

📋 Available headings:
- Heading 1
- Heading 2
- React ⚛️ (found!)

✅ React section successfully extracted
📝 Preview: <first 100 chars>

💡 Recommendation: Everything looks good!
```

For errors, provide:

```
❌ Testing Article #<number>

⚠️  Issue: React section not found

📋 Available headings found:
- Heading 1
- Heading 2

💡 Recommendations:
1. Check if the HTML structure changed
2. Update selectors in services/articleService.js
3. Test with article #260 (known to work)

📂 Files to check:
- services/articleService.js:42 (React section selector)
- services/scraper.js:64 (URL construction)
```

## Error Handling

If the test script fails to run:
- Check if dependencies are installed: `ls {baseDir}/node_modules`
- Verify the script exists: `ls {baseDir}/scripts/test-article.js`
- Check file permissions
- Try with Node.js if Bun fails

If unable to diagnose the issue:
- Offer to inspect the scraper code directly
- Suggest running the bot in development mode
- Recommend checking the site's HTML manually

## Examples

### Example 1: Successful Test

**User:** "Test article 260"

**Actions:**
1. Run: `bun scripts/test-article.js 260`
2. Analyze output showing React section found
3. Report success with preview of extracted content

### Example 2: React Section Not Found

**User:** "Article 114 isn't working"

**Actions:**
1. Run: `bun scripts/test-article.js 114`
2. Analyze output showing no React section
3. Show available headings from output
4. Explain that older articles may use different HTML structure
5. Suggest updating selectors or adding fallback logic

### Example 3: Article Doesn't Exist

**User:** "Test the latest article"

**Actions:**
1. Run: `bun scripts/test-article.js 999`
2. See 404 error
3. Explain article doesn't exist yet
4. Suggest trying a lower number or checking the newsletter site

## Code References

- Test script: `{baseDir}/scripts/test-article.js`
- Article parsing: `{baseDir}/services/articleService.js`
- Scraper logic: `{baseDir}/services/scraper.js`
- URL validation: `{baseDir}/utils/urlValidator.js`
- Constants: `{baseDir}/config/constants.js`
