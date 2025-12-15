const OpenAI = require("openai");
const { OPENAI_API_KEY } = require("../config/env");
const { OPENAI } = require("../config/constants");
const { logError, logInfo } = require("../utils/logger");
const scraper = require("./scraper");
const {
  sanitizeApiKey,
  validateModel,
  validateMaxTokens,
  validateTemperature,
  validatePromptLength,
  validateSystemPromptLength,
  sanitizeContent,
  truncateContent,
} = require("../utils/openaiSecurity");

class OpenAIService {
  constructor() {
    // Validate API key is present before creating client
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required but not configured");
    }

    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }

  /**
   * Retry function with exponential backoff for rate limit errors
   * @param {Function} fn - Function to retry
   * @param {number} maxAttempts - Maximum number of retry attempts
   * @param {number} attempt - Current attempt number
   * @returns {Promise<any>} - Result of the function
   */
  async _retryWithBackoff(fn, maxAttempts = 3, attempt = 1) {
    try {
      return await fn();
    } catch (err) {
      // Only retry on rate limit errors (429)
      const isRateLimit = err.status === 429 || err.statusCode === 429;
      const shouldRetry = isRateLimit && attempt < maxAttempts;

      if (!shouldRetry) {
        throw err; // Re-throw if not retryable or max attempts reached
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        OPENAI.RETRY.INITIAL_DELAY *
          Math.pow(OPENAI.RETRY.BACKOFF_MULTIPLIER, attempt - 1),
        OPENAI.RETRY.MAX_DELAY
      );

      logInfo(
        `Rate limit hit (attempt ${attempt}/${maxAttempts}). Retrying in ${
          delay / 1000
        }s...`
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Retry
      return await this._retryWithBackoff(fn, maxAttempts, attempt + 1);
    }
  }

  /**
   * Generate a response using OpenAI Chat API
   * @param {string} prompt - The user's prompt/question
   * @param {string} systemPrompt - Optional system prompt to set context
   * @param {Object} options - Additional options (model, temperature, max_tokens)
   * @returns {Promise<string>} - The generated response
   */
  async chat(prompt, systemPrompt = null, options = {}) {
    try {
      // Validate inputs
      validatePromptLength(prompt);
      if (systemPrompt) {
        validateSystemPromptLength(systemPrompt);
      }

      // Sanitize inputs to prevent injection
      const sanitizedPrompt = sanitizeContent(prompt);
      const sanitizedSystemPrompt = systemPrompt
        ? sanitizeContent(systemPrompt)
        : null;

      // Validate and sanitize options
      const model = validateModel(options.model || OPENAI.DEFAULT_MODEL);
      const maxTokens = validateMaxTokens(
        options.max_tokens,
        OPENAI.MAX_TOKENS.DEFAULT
      );
      const temperature = validateTemperature(options.temperature);

      const messages = [];

      if (sanitizedSystemPrompt) {
        messages.push({
          role: "system",
          content: sanitizedSystemPrompt,
        });
      }

      messages.push({
        role: "user",
        content: sanitizedPrompt,
      });

      // Retry logic for rate limit errors
      const completion = await this._retryWithBackoff(
        () =>
          this.client.chat.completions.create({
            model: model,
            messages: messages,
            temperature: temperature,
            max_tokens: maxTokens,
          }),
        OPENAI.RETRY.MAX_ATTEMPTS
      );

      const response = completion.choices[0]?.message?.content?.trim();

      if (!response) {
        throw new Error("No response generated from OpenAI");
      }

      // Extract usage information
      const usage = completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens || 0,
            completionTokens: completion.usage.completion_tokens || 0,
            totalTokens: completion.usage.total_tokens || 0,
          }
        : null;

      return {
        content: response,
        usage: usage,
        model: model,
      };
    } catch (err) {
      // Sanitize error messages to prevent API key leakage
      const sanitizedError = err.message
        ? sanitizeApiKey(err.message)
        : "Unknown error";

      // Log sanitized error (never log full error object which might contain API key)
      logError("OpenAI API error:", sanitizedError);

      // Handle specific OpenAI API errors
      if (err.status === 401) {
        throw new Error(
          "Invalid OpenAI API key. Please check your configuration."
        );
      }

      if (err.status === 429 || err.statusCode === 429) {
        // Check if retry headers are present (OpenAI SDK may expose this differently)
        let retryAfter = null;
        if (err.response?.headers) {
          retryAfter =
            err.response.headers["retry-after"] ||
            err.response.headers["Retry-After"];
        } else if (err.headers) {
          retryAfter = err.headers["retry-after"] || err.headers["Retry-After"];
        }

        const retryMessage = retryAfter
          ? `OpenAI API rate limit exceeded. Please try again in ${retryAfter} seconds.`
          : "OpenAI API rate limit exceeded. Please try again in a few minutes.";

        throw new Error(retryMessage);
      }

      if (err.status === 500 || err.status >= 502) {
        throw new Error(
          "OpenAI API is temporarily unavailable. Please try again later."
        );
      }

      // Generic error (sanitized)
      throw new Error(`Failed to generate response: ${sanitizedError}`);
    }
  }

  /**
   * Summarize text content
   * @param {string} text - Text to summarize
   * @param {number} maxLength - Maximum length of summary (in words, approximate)
   * @returns {Promise<string>} - Summarized text
   */
  async summarize(text, maxLength = 100) {
    const prompt = `Please provide a concise summary of the following text in approximately ${maxLength} words:\n\n${text}`;
    const systemPrompt =
      "You are a helpful assistant that provides clear, concise summaries.";

    const result = await this.chat(prompt, systemPrompt, {
      max_tokens: Math.min(maxLength * 2, 500), // Rough estimate: 2 tokens per word
      temperature: 0.3, // Lower temperature for more factual summaries
    });

    // Return just the content for backward compatibility
    return typeof result === "string" ? result : result.content;
  }

  /**
   * Analyze article content
   * @param {string} articleText - The article content
   * @returns {Promise<string>} - Analysis of the article
   */
  async analyzeArticle(articleText) {
    const prompt = `Analyze the following React newsletter article and provide insights about the topics covered, key trends, and notable highlights:\n\n${articleText}`;
    const systemPrompt =
      "You are a React expert that analyzes newsletter content and provides valuable insights.";

    const result = await this.chat(prompt, systemPrompt, {
      max_tokens: 600,
      temperature: 0.5,
    });

    // Return just the content for backward compatibility
    return typeof result === "string" ? result : result.content;
  }

  /**
   * Fetch and parse content from a single article URL
   * @param {Object} articleItem - Object with title and url
   * @returns {Promise<Object>} - Object with title, url, and content (or error)
   */
  async fetchArticleContent(articleItem) {
    try {
      // Sanitize URL in logs (don't log full URL which might contain sensitive params)
      const safeUrl = articleItem.url
        ? articleItem.url.substring(0, 100) +
          (articleItem.url.length > 100 ? "..." : "")
        : "unknown";
      logInfo(`Fetching content from: ${articleItem.title} (${safeUrl})`);
      const $ = await scraper.fetchExternal(articleItem.url);
      const content = scraper.extractArticleContent($);
      return {
        title: articleItem.title,
        url: articleItem.url,
        content: content,
        success: true,
      };
    } catch (err) {
      logError(`Failed to fetch ${articleItem.url}:`, err.message);
      return {
        title: articleItem.title,
        url: articleItem.url,
        content: `[Unable to fetch content: ${err.message}]`,
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Create a detailed React-focused digest of a newsletter issue
   * @param {Object} reactSectionData - Object containing issueNumber, title, url, featured, items
   * @param {Function} progressCallback - Optional callback to report progress
   * @returns {Promise<string>} - Detailed digest following the specified format
   */
  async createReactDigest(reactSectionData, progressCallback = null) {
    const { issueNumber, title, url, featured, items } = reactSectionData;

    // Collect all articles to fetch, separating those with "(AI skipped)" in title
    const articlesToFetch = [];
    const skippedArticles = [];
    let itemCounter = 0; // Track position for numbering non-featured items

    if (featured) {
      if (featured.title && featured.title.includes("(AI skipped)")) {
        skippedArticles.push({
          ...featured,
          isFeatured: true,
          originalIndex: -1,
        });
      } else {
        articlesToFetch.push({ ...featured, isFeatured: true });
      }
    }
    if (items && items.length > 0) {
      items.forEach((item) => {
        if (item.title && item.title.includes("(AI skipped)")) {
          skippedArticles.push({
            ...item,
            isFeatured: false,
            originalIndex: itemCounter,
          });
        } else {
          articlesToFetch.push({ ...item, isFeatured: false });
        }
        itemCounter++;
      });
    }

    // Fetch articles with concurrency limit to avoid overwhelming external servers
    // Process in batches to be respectful to external sites
    const CONCURRENT_FETCHES = 5; // Max 5 articles fetched simultaneously
    const fetchedArticles = [];

    for (let i = 0; i < articlesToFetch.length; i += CONCURRENT_FETCHES) {
      const batch = articlesToFetch.slice(i, i + CONCURRENT_FETCHES);

      const batchPromises = batch.map(async (article, batchIndex) => {
        const globalIndex = i + batchIndex + 1;
        if (progressCallback) {
          progressCallback(
            `Fetching article ${globalIndex}/${articlesToFetch.length}: ${article.title}`
          );
        }
        return await this.fetchArticleContent(article);
      });

      const batchResults = await Promise.all(batchPromises);
      fetchedArticles.push(...batchResults);

      // Small delay between batches to be respectful to external servers
      if (i + CONCURRENT_FETCHES < articlesToFetch.length) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
      }
    }

    // Count successful fetches
    const successCount = fetchedArticles.filter((a) => a.success).length;
    logInfo(
      `Successfully fetched ${successCount}/${fetchedArticles.length} articles`
    );

    // Build the content list for the prompt with actual article content
    // Sanitize and truncate each article's content for security
    // Reserve space for prompt template (~800 chars for minimal system + user prompt template)
    const PROMPT_TEMPLATE_OVERHEAD = 800;
    const maxContentLength =
      OPENAI.MAX_PROMPT_LENGTH - PROMPT_TEMPLATE_OVERHEAD;

    let contentList = "";
    let totalContentLength = 0;
    let articlesIncluded = 0;
    const totalArticles = fetchedArticles.length;

    fetchedArticles.forEach((article, idx) => {
      // Sanitize and truncate article content
      let articleContent = sanitizeContent(article.content || "");

      // Calculate remaining space for content
      const remainingSpace = maxContentLength - totalContentLength - 500; // Reserve 500 for article header/footer

      // Dynamically adjust article content length based on remaining space
      const maxArticleLength = Math.min(
        OPENAI.MAX_ARTICLE_CONTENT_LENGTH,
        Math.max(remainingSpace / (totalArticles - idx), 2000) // Ensure at least 2000 chars per remaining article
      );

      articleContent = truncateContent(articleContent, maxArticleLength);

      const prefix = article.isFeatured ? "⭐ Featured" : `${idx + 1}.`;
      const articleSection = `${prefix} ${article.title}\nURL: ${article.url}\n\nContent:\n${articleContent}\n\n---\n\n`;

      // Check total content length limit (accounting for prompt template)
      if (totalContentLength + articleSection.length > maxContentLength) {
        // Stop adding articles if we exceed total limit
        const remaining = totalArticles - articlesIncluded;
        contentList += `\n[${remaining} additional article${
          remaining > 1 ? "s" : ""
        } truncated due to length limits]\n`;
        return;
      }

      contentList += articleSection;
      totalContentLength += articleSection.length;
      articlesIncluded++;
    });

    logInfo(
      `Included ${articlesIncluded}/${totalArticles} articles in digest (${totalContentLength.toLocaleString()} chars)`
    );

    // Use minimal system prompt (merged essential info into user prompt to save space)
    const systemPrompt = `You are an assistant that creates concise React-focused digests for experienced developers.`;

    let userPrompt = `Create a detailed overview of the React section from This Week in React issue #${issueNumber}.

Task: Analyze ONLY the React section content below. Exclude React Native, jobs, sponsors, tours.

For EACH item, provide:
- Summary (3 - 5 sentences)
- Key takeaways (bullet points)
- Usefulness assessment for React developers
- Recommendation: Read fully / Summary sufficient

Preserve original order. Use clear, neutral, practical tone.

Output format (repeat for each item):

Title
- Summary
- Key takeaways:
  - bullet point
  - bullet point
- Recommendation: Read fully / Summary is sufficient

React Section Content:
${contentList}`;

    // Validate prompt length before sending
    // If still too long after truncation, further truncate contentList
    const fullPromptLength = userPrompt.length;
    if (fullPromptLength > OPENAI.MAX_PROMPT_LENGTH) {
      const excess = fullPromptLength - OPENAI.MAX_PROMPT_LENGTH;
      logInfo(
        `Warning: Prompt (${fullPromptLength.toLocaleString()} chars) exceeds limit by ${excess.toLocaleString()} chars, truncating...`
      );

      // Calculate how much to truncate from contentList
      const promptTemplateLength = userPrompt.length - contentList.length;
      const maxAllowedContentLength =
        OPENAI.MAX_PROMPT_LENGTH - promptTemplateLength - 100; // 100 char buffer

      if (maxAllowedContentLength > 0) {
        contentList =
          contentList.substring(0, maxAllowedContentLength) +
          "\n\n[Content truncated to fit prompt limits]";

        // Rebuild userPrompt with truncated content (using shorter version)
        userPrompt = `Create a detailed overview of the React section from This Week in React issue #${issueNumber}.

Task: Analyze ONLY the React section content below. Exclude React Native, jobs, sponsors, tours.

For EACH item, provide:
- Summary (3-5 sentences)
- Key takeaways (bullet points)
- Usefulness assessment for React developers
- Recommendation: Read fully / Summary sufficient

Preserve original order. Use clear, neutral, practical tone.

Output format (repeat for each item):

Title
- Summary
- Key takeaways:
  - bullet point
  - bullet point
- Recommendation: Read fully / Summary is sufficient

React Section Content:
${contentList}`;
      } else {
        throw new Error(
          `Prompt template itself exceeds limit. Template length: ${promptTemplateLength}, Max allowed: ${OPENAI.MAX_PROMPT_LENGTH}`
        );
      }
    }

    validatePromptLength(userPrompt);

    const result = await this.chat(userPrompt, systemPrompt, {
      model: validateModel("gpt-4.1"), // Use GPT-4.1 for better analysis quality
      max_tokens: validateMaxTokens(
        OPENAI.MAX_TOKENS.DIGEST,
        OPENAI.MAX_TOKENS.DIGEST
      ),
      temperature: validateTemperature(0.3), // Lower temperature for more factual, consistent output
    });

    // Append skipped articles to the digest (excluded from AI parsing but included in output)
    if (skippedArticles.length > 0) {
      const digestContent =
        typeof result === "string" ? result : result.content;
      let skippedSection = "\n\n---\n\n";
      skippedSection += "Items excluded from AI analysis:\n\n";

      skippedArticles.forEach((article) => {
        const prefix = article.isFeatured
          ? "⭐ Featured"
          : `${article.originalIndex + 1}.`;
        skippedSection += `${prefix} ${article.title}\n${article.url}\n\n`;
      });

      // Update result with appended skipped articles
      if (typeof result === "string") {
        return digestContent + skippedSection;
      } else {
        return {
          ...result,
          content: digestContent + skippedSection,
        };
      }
    }

    // Return result with usage information
    return result;
  }
}

module.exports = new OpenAIService();
