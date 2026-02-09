# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram bot that fetches and sends React newsletter content from "This Week In React" every Thursday. Built with Telegraf (bot framework), Axios + Cheerio (scraping), node-cron (scheduling), and OpenAI (AI digests). Runs on Bun (preferred) or Node.js.

## Commands

```bash
# Install
bun install

# Development with hot reload
bun dev                        # Bun (preferred)
pnpm node:dev                  # Node.js + nodemon

# Production
bun prod                       # NODE_ENV=production
pnpm node:prod                 # Node.js equivalent

# Test article scraping (most common debugging task)
bun scripts/test-article.js 260
```

No test suite exists. The test-article script is the primary way to verify scraping works.

## Architecture

**Strict separation of concerns — business logic goes in services, never in handlers.**

- `index.js` — Entry point: initializes bot, registers commands, sets up shutdown handlers, starts cron
- `config/constants.js` — All magic numbers and configuration values (timeouts, limits, cron schedule)
- `config/env.js` — Environment variable validation and export
- `services/` — Singleton instances (`module.exports = new ServiceClass()`)
  - `scraper.js` — HTTP fetching with URL validation, HTML parsing via Cheerio
  - `articleService.js` — **Most fragile file.** Extracts React section from newsletter HTML using multiple fallback strategies (h2 text match → emoji match → any heading). When scraping breaks, this is where selectors need updating.
  - `telegramService.js` — Bot lifecycle, message sending, `checkAndSend()` for scheduled checks
  - `openaiService.js` — AI digest generation with retry/backoff, token tracking
  - `searchService.js` — SQLite FTS5 search. Auto-detects Bun native SQLite vs better-sqlite3
- `handlers/commands.js` — All bot commands: `/start`, `/now` (admin), `/article <n>`, `/digest <n>`, `/search <query>`
- `middleware/` — `rateLimit.js` (factory), `auth.js` (checks ALLOWED_USER_IDS), `errorHandler.js`
- `utils/` — Custom error classes (`errors.js`), URL validation with SSRF protection (`urlValidator.js`), input validation (`validators.js`), atomic state persistence (`stateManager.js`)
- `state.json` — Tracks `lastArticle` number to detect new issues on scheduled runs

## Data Flow

Scheduled check (Thursday 10:00): cron → `telegramService.checkAndSend()` → scraper gets latest URL → compares article number with `state.json` → if new: `articleService` parses React section → indexes in search DB → sends message → updates state.

Manual `/article N`: rate limit middleware → validate input → `articleService.getArticle(N)` → index → reply.

## Key Conventions

- **All user-facing commands** must have `rateLimitMiddleware()` applied (3 req / 5 min per user)
- **Admin commands** (like `/now`) check `isAuthorized(ctx)` against ALLOWED_USER_IDS env var
- **URL fetching** must go through `validateArticleUrl()` (SSRF protection, whitelist: thisweekinreact.com only)
- **Constants** in `UPPER_SNAKE_CASE` in `config/constants.js`, never hardcoded
- **Errors** use custom classes from `utils/errors.js` (NetworkError, ValidationError, ParsingError, NotFoundError)
- **New env vars** need validation in `config/env.js`

## Environment Variables

- `BOT_TOKEN` (required) — Telegram bot token
- `OPENAI_API_KEY` (optional) — Enables `/digest` command
- `ALLOWED_USER_IDS` (optional) — Comma-separated, restricts `/now` command. Empty = allow all
- `NODE_ENV` — "development" or "production"

## Scraper Debugging

When "React section not found" errors occur, the newsletter HTML structure likely changed:
1. Run `bun scripts/test-article.js <number>` to see available headings and what the parser finds
2. Update Cheerio selectors in `services/articleService.js` (`_findReactSection` method)
3. Test with multiple article numbers to avoid breaking older articles

## Skills System

AI skills live in `ai/skills/[name]/SKILL.md`. Each skill has step-by-step instructions for a specific task. Available skills: `test-article`, `add-command`, `add-service`, `security-audit`, `deploy`, `debug-scraper`, `migrate-selectors`, `monitor-bot`, `review-code`, `understand-codebase`. Read the matching skill before acting on a request.

## Professional Objectivity

Question first, implement second. Challenge ideas rather than blindly validating. Point out problems, show tradeoffs, check if existing tools solve the problem before building custom solutions.
