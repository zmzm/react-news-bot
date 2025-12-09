---
name: understand-codebase
description: Provide comprehensive overview of the codebase structure, architecture, components, data flow, configuration, and guide for navigating and extending the Telegram bot project
allowed-tools: Read, Grep, Glob
---

# Understand Codebase

## Overview

This skill provides a comprehensive walkthrough of the This Week In React Telegram bot codebase, explaining its structure, architecture, components, and how everything works together.

## Prerequisites

- Basic understanding of Node.js/Bun
- Familiarity with Telegram bots (helpful but not required)
- Understanding of async/await and promises

## Instructions

Provide a thorough explanation of the codebase:

### Step 1: High-Level Overview

Start with the big picture:

**Project Purpose:**
This is a Telegram bot that automatically sends the React section from "This Week In React" newsletter every Thursday at 10:00 AM. Users can also manually fetch specific articles by number.

**Tech Stack:**

- **Runtime:** Bun
- **Bot Framework:** Telegraf (Telegram bot framework)
- **HTTP Client:** Axios (for fetching articles)
- **HTML Parser:** Cheerio (jQuery-like HTML parsing)
- **Scheduler:** node-cron (for scheduled tasks)
- **Environment:** dotenv (environment variable management)

**Key Features:**

1. Automated weekly updates (Thursday 10:00 AM)
2. Manual article fetching via `/article <number>` command
3. Security features (rate limiting, URL validation, SSRF protection)
4. Modular architecture with separation of concerns
5. Hot reload support for development

**Read architecture doc:**

```bash
Read: {baseDir}/ARCHITECTURE.md
```

### Step 2: Directory Structure

Explain the organization:

```bash
# List directory structure
ls -la {baseDir}
```

**Structure:**

```
thisweekinreact-bot/
├── config/              # Configuration and environment
│   ├── env.js          # Environment variable validation
│   └── constants.js    # Application constants
├── services/           # Business logic
│   ├── scraper.js      # HTTP fetching and HTML parsing
│   ├── articleService.js # Article parsing and formatting
│   └── telegramService.js # Bot operations
├── handlers/           # Command handlers
│   └── commands.js     # Bot command definitions
├── middleware/         # Bot middleware
│   ├── errorHandler.js # Error handling
│   ├── auth.js         # Authorization
│   └── rateLimit.js    # Rate limiting
├── utils/              # Utilities
│   ├── urlValidator.js # URL validation (SSRF protection)
│   ├── rateLimiter.js  # Rate limiter logic
│   └── stateManager.js # State persistence
├── scheduler/          # Scheduled tasks
│   └── cron.js         # Cron job definitions
├── scripts/            # Utility scripts
│   └── test-article.js # Test article scraping
├── docs/               # Documentation
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── BUN_DEPLOYMENT.md
│   └── SCRAPING_STRATEGY.md
├── .claude/            # Claude Code configuration
│   ├── hooks/          # Lifecycle hooks
│   └── skills/         # Reusable skills
├── index.js            # Main entry point
├── package.json        # Dependencies and scripts
├── state.json          # Bot state (last sent article)
├── .env                # Environment variables (not in git)
├── .env.example        # Environment template
└── CLAUDE.md           # Claude Code instructions
```

### Step 3: Core Components Explained

Dive into each component:

#### Config Module (`config/`)

**env.js:**

```bash
Read: {baseDir}/config/env.js
```

Responsibilities:

- Validates required environment variables on startup
- Provides typed exports for safe access
- Ensures BOT_TOKEN and TELEGRAM_CHAT_ID are present
- Parses ALLOWED_USER_IDS for authorization
- Sets NODE_ENV with default

**constants.js:**

```bash
Read: {baseDir}/config/constants.js
```

Responsibilities:

- Centralizes all application constants
- HTTP timeouts, response size limits
- Rate limiting configuration
- Cron schedule
- File paths
- Single source of truth

#### Services Module (`services/`)

**scraper.js:**

```bash
Read: {baseDir}/services/scraper.js
```

Responsibilities:

- Configures axios HTTP client
- Fetches HTML content from URLs
- Loads HTML into Cheerio for parsing
- Gets latest article URL from newsletter page
- Builds article URLs from numbers
- ALWAYS validates URLs before fetching

Key methods:

- `fetch(url)` - Fetch and parse HTML
- `getLatestArticleUrl()` - Get latest article URL
- `getArticleUrl(number)` - Build URL for article number

**articleService.js:**

```bash
Read: {baseDir}/services/articleService.js
```

Responsibilities:

- Parses React section from article HTML
- Extracts featured articles
- Extracts list items
- Formats content for Telegram
- Handles message truncation
- Error handling for parse failures

Key methods:

- `getArticle(number)` - Main entry point
- `parseReactSection($)` - Extract React content
- `formatMessage(...)` - Format for Telegram

Parsing strategy:

1. Find React section heading (h2 containing "React")
2. Extract featured subsection (h3 "Featured")
3. Extract list items between heading and next h2
4. Format as Telegram message with links

**telegramService.js:**

```bash
Read: {baseDir}/services/telegramService.js
```

Responsibilities:

- Manages Telegraf bot instance
- Sends messages to configured chat
- Checks for new articles
- Prevents duplicate sends (via state.json)
- Bot lifecycle (launch, stop)

Key methods:

- `getBot()` - Get bot instance
- `launch()` - Start bot
- `stop()` - Graceful shutdown
- `sendMessage(text)` - Send to configured chat
- `checkAndSend()` - Check for new articles and send

#### Handlers Module (`handlers/`)

**commands.js:**

```bash
Read: {baseDir}/handlers/commands.js
```

Responsibilities:

- Registers all bot commands
- Applies middleware (rate limiting, auth)
- Validates user input
- Delegates to services
- Error handling

Commands:

- `/start` - Welcome message (no middleware needed)
- `/now` - Manual check (auth + rate limit)
- `/article <number>` - Fetch specific article (rate limit)

Pattern:

```javascript
bot.command("name", rateLimitMiddleware(), async (ctx) => {
  // 1. Validate input
  // 2. Check authorization if needed
  // 3. Delegate to service
  // 4. Handle errors
  // 5. Send response
});
```

#### Middleware Module (`middleware/`)

**errorHandler.js:**

- Global error catcher for bot
- Logs errors server-side
- Sends user-friendly messages
- Never exposes stack traces

**auth.js:**

- Checks if user is authorized
- Compares against ALLOWED_USER_IDS
- Returns boolean

**rateLimit.js:**

- Factory for rate limit middleware
- Uses rateLimiter utility
- Sends rate limit messages

#### Utils Module (`utils/`)

**urlValidator.js:**

```bash
Read: {baseDir}/utils/urlValidator.js
```

CRITICAL for security:

- Validates URLs against whitelist
- Only allows `thisweekinreact.com`
- Prevents SSRF attacks
- Two validators: strict (article URLs) and permissive (nested links)

**rateLimiter.js:**

- Rate limiter class
- In-memory storage (per user)
- Configurable window and max requests
- Cleans up old entries

**stateManager.js:**

- Loads/saves state.json
- Tracks last sent article
- Atomic file operations
- Error handling

#### Scheduler Module (`scheduler/`)

**cron.js:**

```bash
Read: {baseDir}/scheduler/cron.js
```

Responsibilities:

- Configures cron jobs
- Schedules weekly check (Thursday 10:00)
- Calls `telegramService.checkAndSend()`

### Step 4: Data Flow

Explain how data flows through the system:

#### Automated Weekly Update Flow

```
1. Thursday 10:00 AM
   └─> Cron job triggers (scheduler/cron.js)

2. Check and Send
   └─> telegramService.checkAndSend()
       ├─> Load state (stateManager)
       ├─> Get latest article URL (scraper)
       ├─> Compare with last sent
       │
       ├─> If new:
       │   ├─> Parse article (articleService)
       │   ├─> Format message
       │   ├─> Send to chat
       │   └─> Save state
       │
       └─> If not new:
           └─> Do nothing
```

#### Manual Article Fetch Flow (`/article 260`)

```
1. User sends: /article 260
   └─> Telegraf receives message

2. Middleware Chain
   └─> rateLimitMiddleware()
       ├─> Check rate limit
       ├─> If exceeded: send error, stop
       └─> If ok: continue

3. Command Handler (handlers/commands.js)
   └─> Parse command arguments
       ├─> Validate article number
       ├─> If invalid: send error, stop
       └─> If valid: continue

4. Service Layer
   └─> articleService.getArticle(260)
       ├─> scraper.getArticleUrl(260)
       ├─> scraper.fetch(url)
       ├─> Parse HTML with Cheerio
       ├─> Extract React section
       ├─> Format for Telegram
       └─> Return formatted text

5. Response
   └─> Send message to user via ctx.reply()

6. Error Handling
   └─> If any step fails:
       ├─> Log detailed error server-side
       └─> Send user-friendly message
```

### Step 5: Configuration

Explain how configuration works:

**Environment Variables (.env):**

```bash
Read: {baseDir}/.env.example
```

Required:

- `BOT_TOKEN` - Telegram bot token from @BotFather
- `TELEGRAM_CHAT_ID` - Chat ID to send messages to

Optional:

- `ALLOWED_USER_IDS` - Comma-separated user IDs for `/now` command
- `NODE_ENV` - "production" or "development"

**Application Constants:**

```bash
Read: {baseDir}/config/constants.js
```

Includes:

- HTTP_TIMEOUT - Request timeout (10 seconds)
- MAX_RESPONSE_SIZE - Max HTML size (5MB)
- RATE_LIMIT_WINDOW - Time window (60 seconds)
- RATE_LIMIT_MAX_REQUESTS - Max requests per window (3)
- CRON_SCHEDULE - When to check ("0 10 \* \* 4" = Thu 10:00)
- STATE_FILE_PATH - Where to save state

### Step 6: Security Features

Explain security measures:

**1. URL Validation (SSRF Protection):**

```bash
Read: {baseDir}/utils/urlValidator.js
```

- Whitelist-only approach
- Only `thisweekinreact.com` allowed
- Prevents Server-Side Request Forgery
- All URLs validated before fetching

**2. Rate Limiting:**

```bash
Read: {baseDir}/utils/rateLimiter.js
```

- In-memory rate limiter
- 3 requests per minute per user
- Prevents abuse and spam
- Applied to user-facing commands

**3. Authorization:**

```bash
Read: {baseDir}/middleware/auth.js
```

- Admin commands require whitelisting
- User ID checked against ALLOWED_USER_IDS
- `/now` command is admin-only

**4. Input Validation:**

- All command arguments validated
- Type checking (numbers, strings)
- Range validation (positive integers)
- Format validation (article numbers)

**5. Error Handling:**

```bash
Read: {baseDir}/middleware/errorHandler.js
```

- Global error handler
- Stack traces never sent to users
- Detailed logs server-side only
- User-friendly error messages

**6. Environment Validation:**

```bash
Read: {baseDir}/config/env.js
```

- Required variables checked on startup
- Token format validated
- Chat ID format validated
- Fails fast if misconfigured

### Step 7: Development Workflow

Explain how to work with the code:

**Setup:**

```bash
# 1. Clone repository
git clone <repo>
cd thisweekinreact-bot

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
nano .env  # Add BOT_TOKEN and TELEGRAM_CHAT_ID

# 4. Test scraping
bun scripts/test-article.js 260

# 5. Start development
bun dev  # Hot reload enabled
```

**Testing:**

```bash
# Test specific article
bun scripts/test-article.js <number>

# Start in dev mode
bun dev

# Then test commands in Telegram:
# /start
# /article 260
```

**Debugging:**

- Add console.log statements
- Check bot logs in terminal
- Use test script for scraping issues
- Review state.json for sent articles

**Production:**

```bash
NODE_ENV=production bun run index.js
```

### Step 8: Common Tasks

Guide for typical development tasks:

**Adding a New Command:**

1. Read `{baseDir}/handlers/commands.js`
2. Follow existing command patterns
3. Add command with appropriate middleware
4. Validate input
5. Delegate to service
6. Handle errors
7. Update README

**Creating a New Service:**

1. Create file in `services/` directory
2. Export singleton: `module.exports = new ServiceClass()`
3. Add JSDoc comments
4. Import in handlers or other services
5. Follow single responsibility principle

**Fixing Scraper Issues:**

1. Run test script: `bun scripts/test-article.js <number>`
2. Identify issue (heading changed, structure changed)
3. Update selectors in `{baseDir}/services/articleService.js`
4. Test with multiple article numbers
5. Consider fallback for older articles

**Adding Configuration:**

1. Constants → `{baseDir}/config/constants.js`
2. Env vars → `{baseDir}/config/env.js` with validation
3. Update `.env.example`
4. Document in README

### Step 9: Extension Points

Suggest where to extend the codebase:

**New Commands:**

- Add to `{baseDir}/handlers/commands.js`
- Follow existing patterns
- Apply middleware as needed

**New Services:**

- Create in `{baseDir}/services/`
- Follow singleton pattern
- Single responsibility

**New Middleware:**

- Create in `{baseDir}/middleware/`
- Export factory function
- Document usage

**New Utilities:**

- Create in `{baseDir}/utils/`
- Export functions or classes
- Reusable across modules

**New Scheduled Tasks:**

- Add to `{baseDir}/scheduler/cron.js`
- Use node-cron syntax
- Call appropriate services

### Step 10: Key Files Reference

Highlight the most important files:

**Must understand:**

1. `{baseDir}/index.js` - Entry point, initialization
2. `{baseDir}/handlers/commands.js` - All commands
3. `{baseDir}/services/articleService.js` - Core scraping logic
4. `{baseDir}/ARCHITECTURE.md` - Design principles
5. `{baseDir}/CLAUDE.md` - Development guidelines

**Configuration:** 6. `{baseDir}/config/env.js` - Environment setup 7. `{baseDir}/config/constants.js` - Application constants 8. `{baseDir}/.env.example` - Environment template

**Security:** 9. `{baseDir}/utils/urlValidator.js` - SSRF protection 10. `{baseDir}/middleware/auth.js` - Authorization 11. `{baseDir}/docs/SECURITY.md` - Security documentation

## Output Format

Provide structured overview:

````markdown
# This Week In React Bot - Codebase Overview

## Quick Facts

- **Purpose:** Automated Telegram bot for React newsletter updates
- **Runtime:** Bun/Node.js
- **Framework:** Telegraf
- **Architecture:** Modular with separation of concerns
- **Lines of Code:** ~[estimated]

## Architecture

[Diagram or description of module relationships]

## Key Components

1. **Services** - Business logic (scraper, article parser, telegram operations)
2. **Handlers** - Command definitions and routing
3. **Middleware** - Cross-cutting concerns (auth, rate limits, errors)
4. **Utils** - Reusable utilities
5. **Config** - Configuration and environment

## Data Flow

[Description of how data flows through the system]

## Security Features

- SSRF protection via URL whitelist
- Rate limiting (3 req/min)
- Authorization for admin commands
- Input validation throughout
- No secrets in code

## Getting Started

```bash
bun install
cp .env.example .env
# Configure .env
bun dev
```
````

## Common Operations

- **Add command:** Edit handlers/commands.js
- **Fix scraper:** Edit services/articleService.js
- **Add config:** Edit config/constants.js
- **Test article:** bun scripts/test-article.js <number>

## Important Files

- Entry: index.js
- Commands: handlers/commands.js
- Scraping: services/articleService.js
- Architecture: ARCHITECTURE.md
- Guidelines: CLAUDE.md

## Next Steps

[Suggest what to explore next based on user's needs]

```

## Error Handling

If files cannot be read:
- Explain based on available information
- Reference documentation
- Offer to read specific files on request

## Examples

### Example 1: New Developer Onboarding

**User:** "I'm new to this project, help me understand it"

**Response:**
1. Explain high-level purpose and architecture
2. Walk through directory structure
3. Explain data flow for key operations
4. Show how to set up and run locally
5. Point to key files to read first

### Example 2: Specific Component Question

**User:** "How does the scraper work?"

**Response:**
1. Read and explain services/scraper.js
2. Explain URL validation
3. Show axios configuration
4. Explain Cheerio parsing
5. Show example usage
6. Reference related files

### Example 3: Adding Feature

**User:** "I want to add a new feature"

**Response:**
1. Understand what they want to build
2. Explain relevant parts of codebase
3. Show similar existing patterns
4. Guide on where to add code
5. Reference extension points
6. Point to relevant skills (add-command, etc.)

## Code References

- Entry point: `{baseDir}/index.js`
- Architecture: `{baseDir}/ARCHITECTURE.md`
- Commands: `{baseDir}/handlers/commands.js`
- Services: `{baseDir}/services/`
- Security: `{baseDir}/docs/SECURITY.md`
- Guidelines: `{baseDir}/CLAUDE.md`
```
