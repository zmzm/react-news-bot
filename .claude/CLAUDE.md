# Claude Code Instructions

This document provides guidance for Claude Code when working on the This Week In React Telegram bot.

## Project Overview

This is a Telegram bot that automatically fetches and sends React newsletter content from "This Week In React" every Thursday. It uses a modular architecture with separation of concerns.

**Tech Stack:**

- Runtime: Bun (recommended) or Node.js
- Bot Framework: Telegraf
- HTTP Client: Axios
- HTML Parser: Cheerio
- Scheduler: node-cron

## Architecture Principles

### Modular Design

The project follows strict separation of concerns:

```
config/      → Configuration and environment validation
services/    → Business logic (singleton services)
handlers/    → Bot command handlers (thin, delegate to services)
middleware/  → Cross-cutting concerns (auth, rate limiting, errors)
utils/       → Reusable utility functions
scheduler/   → Cron job definitions
```

**IMPORTANT**: Always respect this structure. Don't put business logic in handlers, and don't put command handling in services.

### Key Design Patterns

1. **Singleton Services**: All services export singleton instances

   ```javascript
   module.exports = new ServiceClass();
   ```

2. **Thin Handlers**: Command handlers should be minimal and delegate to services

   ```javascript
   bot.command("name", middleware, async (ctx) => {
     await service.doWork();
     await ctx.reply("Done");
   });
   ```

3. **Middleware Chain**: Apply middleware in order: rateLimit → auth → error handling

   ```javascript
   bot.command("admin", rateLimitMiddleware(), async (ctx) => {
     if (!isAuthorized(ctx)) return;
     // handler logic
   });
   ```

4. **Centralized Configuration**: Use `config/constants.js` for constants, `config/env.js` for environment variables

## Security Requirements

### Critical Security Rules

1. **URL Validation**: ALWAYS use `validateArticleUrl()` before fetching URLs

   - Prevents SSRF attacks
   - Only allows `thisweekinreact.com` domain
   - See `utils/urlValidator.js`

2. **Input Validation**: Validate ALL user input

   - Check article numbers are positive integers
   - Sanitize command arguments
   - Never trust user input

3. **No Hardcoded Secrets**: Use environment variables

   - All secrets in `.env` file
   - Validate with `config/env.js`
   - Never commit `.env`

4. **Rate Limiting**: Apply to all user-facing commands

   ```javascript
   bot.command("name", rateLimitMiddleware(), handler);
   ```

5. **Authorization**: Protect admin commands

   ```javascript
   if (!isAuthorized(ctx)) {
     await ctx.reply("❌ You don't have permission");
     return;
   }
   ```

6. **Error Messages**: Never expose stack traces to users
   - Catch all errors
   - Send user-friendly messages
   - Log details server-side only

## Code Conventions

### File Organization

- **New commands**: Add to `handlers/commands.js`
- **New business logic**: Create service in `services/`
- **New utilities**: Add to `utils/`
- **New constants**: Add to `config/constants.js`
- **New env vars**: Add to `config/env.js` with validation

### Naming Conventions

- **Services**: `camelCase`, descriptive names (e.g., `articleService`, `telegramService`)
- **Functions**: `camelCase`, verb-noun pattern (e.g., `getArticle`, `checkAndSend`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `HTTP_TIMEOUT`, `MAX_RESPONSE_SIZE`)
- **Files**: `camelCase.js` (e.g., `articleService.js`, `rateLimiter.js`)

### Error Handling

Always use this pattern:

```javascript
try {
  const result = await service.doWork();
  await ctx.reply(result);
} catch (err) {
  console.error("Detailed error:", err);
  await ctx.reply(`❌ User-friendly error message`);
}
```

### Async/Await

- Always use `async/await`, never raw promises
- Always handle rejections
- No floating promises

### Documentation

Add JSDoc comments to all exported functions:

```javascript
/**
 * Fetch article by number
 * @param {number} articleNumber - The article number
 * @returns {Promise<string>} - Formatted article text
 */
async getArticle(articleNumber) {
  // implementation
}
```

## Common Tasks

### Adding a New Command

1. Open `handlers/commands.js`
2. Follow existing command patterns
3. Apply middleware (rate limit, auth if needed)
4. Validate input
5. Delegate to service for business logic
6. Handle errors gracefully
7. Update README.md with new command

**Use the `add-command` skill for guided implementation.**

### Fixing Scraper Issues

When the scraper breaks (site HTML changes):

1. Use `bun scripts/test-article.js <number>` to debug
2. Check `services/articleService.js` selectors
3. Update Cheerio selectors as needed
4. Test with multiple article numbers
5. Add fallback logic for older articles if needed

**Use the `debug-scraper` skill for step-by-step guidance.**

### Adding New Configuration

1. For constants: Add to `config/constants.js`
2. For env vars: Add to `config/env.js` with validation
3. Update `.env.example` if needed
4. Document in README.md

## Development Workflow

### Local Development

```bash
# Setup
bun install
cp .env.example .env
# Edit .env with your bot token

# Development (hot reload)
bun dev

# Test article scraping
bun scripts/test-article.js 260

# Production
bun prod
```

### Testing Changes

1. Test with `/article` command for specific articles
2. Use test script for debugging: `bun scripts/test-article.js <number>`
3. Test error cases (invalid input, network failures)
4. Verify rate limiting and authorization

### Before Committing

The pre-commit hook will check for:

- Accidentally committed `.env` file
- Hardcoded credentials
- Console.log statements (warning)

**Review your changes carefully before committing.**

## Troubleshooting

### Common Issues

1. **"React section not found"**

   - HTML structure changed
   - Update selectors in `services/articleService.js`
   - Use test script to inspect HTML

2. **"Article not found (404)"**

   - Article number doesn't exist
   - Check URL construction in `services/scraper.js`

3. **Rate limit errors**

   - Adjust limits in `middleware/rateLimit.js`
   - Or clear rate limiter (restart bot)

4. **Authorization failures**
   - Check `ALLOWED_USER_IDS` in `.env`
   - Must be comma-separated user IDs

### Debug Mode

Add logging temporarily:

```javascript
console.log("Debug:", { variable, anotherVar });
```

**Remove before committing to production.**

## Skills Available

Use these skills for guided assistance:

- `test-article` - Test article scraping
- `add-command` - Add new bot command
- `security-audit` - Security review
- `deploy` - Deployment guide
- `debug-scraper` - Debug scraping issues
- `review-code` - Code review
- `understand-codebase` - Learn codebase structure

Invoke by asking: "use the test-article skill" or "test article scraping"

## Important Files

### Must Read Before Changes

- `docs/ARCHITECTURE.md` - Architecture patterns and principles
- `docs/SECURITY.md` - Security considerations
- `handlers/commands.js` - Command patterns
- `services/articleService.js` - Scraping logic (most fragile)

### Configuration Files

- `.env` - Environment variables (never commit)
- `.env.example` - Template for required variables
- `config/env.js` - Environment validation
- `config/constants.js` - Application constants

### Core Services

- `services/scraper.js` - HTTP fetching and HTML parsing
- `services/articleService.js` - Article parsing and formatting
- `services/telegramService.js` - Bot operations and lifecycle

## Anti-Patterns to Avoid

❌ **Don't do this:**

```javascript
// Business logic in handlers
bot.command("article", async (ctx) => {
  const $ = await axios.get(url); // ❌ Should be in service
  // parsing logic here
});

// Hardcoded values
const timeout = 10000; // ❌ Should be in config/constants.js

// Unvalidated URLs
await axios.get(userProvidedUrl); // ❌ Must validate first

// Exposing errors
await ctx.reply(err.stack); // ❌ Never expose stack traces
```

✅ **Do this instead:**

```javascript
// Delegate to services
bot.command("article", rateLimitMiddleware(), async (ctx) => {
  try {
    const text = await articleService.getArticle(number);
    await ctx.reply(text);
  } catch (err) {
    console.error("Error:", err);
    await ctx.reply("❌ Failed to fetch article");
  }
});

// Use constants
const { HTTP_TIMEOUT } = require("./config/constants");

// Validate URLs
const validUrl = validateArticleUrl(url);
await axios.get(validUrl);

// User-friendly errors
await ctx.reply("❌ Something went wrong. Please try again.");
```

## Performance Considerations

- **Timeouts**: Set appropriate timeouts (see `config/constants.js`)
- **Response Size**: Limit max response size to prevent memory issues
- **Rate Limiting**: Balance between UX and resource usage
- **Cron Jobs**: Run at appropriate times (currently Thursday 10:00 AM)
- **In-Memory State**: Rate limiter is in-memory (resets on restart)

## Deployment Notes

- Support both Bun and Node.js runtimes
- Use `NODE_ENV=production` in production
- Ensure `.env` is not deployed (use platform secrets)
- State file (`state.json`) must be writable
- Process manager recommended (PM2, systemd, Docker)

**See `deploy` skill for detailed deployment guide.**

## When in Doubt

1. Check `docs/ARCHITECTURE.md` for design patterns
2. Look at existing code for patterns
3. Use skills for guided assistance
4. Ask user for clarification on requirements
5. Prefer simple solutions over complex ones
6. Security first, always validate input
7. Test thoroughly before marking tasks complete

## References

- Architecture: `docs/ARCHITECTURE.md`
- Security: `docs/SECURITY.md`
- Deployment: `docs/BUN_DEPLOYMENT.md`
- Scraping Strategy: `docs/SCRAPING_STRATEGY.md`
- Hooks & Skills: `README.md`
