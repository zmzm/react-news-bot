#!/usr/bin/env bun
/**
 * Test script to debug article fetching
 * Usage: bun scripts/test-article.js <article-number>
 */

require("dotenv").config();
const articleService = require("../services/articleService");
const scraper = require("../services/scraper");

async function testArticle(articleNumber) {
  console.log(`\n🔍 Testing article #${articleNumber}...\n`);

  try {
    // Step 1: Build URL
    console.log("Step 1: Building article URL...");
    const articleUrl = scraper.getArticleUrl(articleNumber);
    console.log(`✅ URL: ${articleUrl}\n`);

    // Step 2: Fetch HTML
    console.log("Step 2: Fetching HTML...");
    const $ = await scraper.fetch(articleUrl);
    console.log(`✅ HTML fetched successfully\n`);

    // Step 3: Check title
    const title = $("h1").first().text().trim();
    console.log(`Step 3: Article title: "${title}"\n`);

    // Step 4: Find React section
    console.log("Step 4: Looking for React section...");
    const headings = $("h1, h2, h3").map((_, el) => ({
      tag: el.tagName,
      text: $(el).text().trim(),
      html: $(el).html(),
    })).get();

    console.log("Available headings:");
    headings.forEach((h, i) => {
      console.log(`  ${i + 1}. <${h.tag}> ${h.text.substring(0, 50)}`);
    });
    console.log();

    const reactHeadings = headings.filter((h) =>
      h.text.toLowerCase().includes("react") && !h.text.toLowerCase().includes("react-native")
    );

    if (reactHeadings.length === 0) {
      console.log("❌ No React section found!");
      console.log("\nAvailable sections:");
      headings.forEach((h) => {
        console.log(`  - ${h.text}`);
      });
      return;
    }

    console.log(`✅ Found ${reactHeadings.length} React section(s):`);
    reactHeadings.forEach((h) => {
      console.log(`  - ${h.text}`);
    });
    console.log();

    // Step 5: Try to parse
    console.log("Step 5: Parsing React section...");
    const text = await articleService.getReactSectionText(articleUrl);
    console.log(`✅ Successfully parsed!\n`);
    console.log("Preview (first 500 chars):");
    console.log(text.substring(0, 500));
    console.log("\n✅ Full article text length:", text.length, "characters");

  } catch (err) {
    console.error("\n❌ Error occurred:");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);

    if (err.response) {
      console.error("HTTP Status:", err.response.status);
      console.error("HTTP Status Text:", err.response.statusText);
    }
  }
}

// Get article number from command line
const articleNumber = process.argv[2] ? parseInt(process.argv[2], 10) : 114;

if (isNaN(articleNumber) || articleNumber < 1) {
  console.error("Usage: bun scripts/test-article.js <article-number>");
  console.error("Example: bun scripts/test-article.js 114");
  process.exit(1);
}

testArticle(articleNumber)
  .then(() => {
    console.log("\n✅ Test completed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  });

