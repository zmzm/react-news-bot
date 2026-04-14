# This Week In React Bot

A Telegram bot that automatically sends the React section from "This Week In React" newsletter every Thursday.

## Features

- 🤖 Automatic weekly updates every Thursday at 10:00 AM (to configured target chats)
- 📰 Fetch any article by number (`/article <number>`)
- 📚 Generate detailed article digests (`/digest <number>`) - AI-powered summaries with key takeaways
- 🗒️ Generate Obsidian issue bundles (`/obsidian <number>`) - creates issue folder with `MOC.md` and per-item notes in `articles/`
- 🔍 Search articles by keyword (`/search <query>`) - Fast keyword search across all indexed articles
- 🔒 Security features (rate limiting, URL validation, SSRF protection)
- 📈 Observability: JSON logs, runtime metrics, health endpoint, optional heartbeat
- 🔄 Hot reload for development (Bun watch mode or nodemon)
- 🛡️ Robust error handling with custom error classes
- 📝 Comprehensive logging and error reporting

## Installation

### Using Bun (Recommended) ⚡

1. Install Bun (if not already installed):

```bash
curl -fsSL https://bun.sh/install | bash
```

2. Install dependencies:

```bash
bun install
```

### Using Node.js (Alternative)

1. Install dependencies:

```bash
pnpm install
# or
npm install
```

2. Create a `.env` file:

```bash
cp .env.example .env
```

3. Fill in your Telegram bot token:

```env
BOT_TOKEN=your_bot_token_here
```

**Note:** The `.env` file is required for both Bun and Node.js setups.

## Usage

### Development Mode (with hot reload)

**Using Bun:**

```bash
bun dev
```

**Using Node.js:**

```bash
pnpm node:dev
```

This will start the bot with hot reload, which automatically restarts the bot when you make changes to the code.

### Production Mode

**Using Bun:**

```bash
bun start
# or
bun prod
```

**Using Node.js:**

```bash
pnpm start
# or
pnpm node:start
```

## Commands

- `/start` - Check if the bot is alive
- `/help` - Show available commands
- `/status` - Show operational status (scheduler/index/state)
- `/status` - Show operational status (scheduler/index/state/metrics)
- `/now` - Manually check for new articles (may require authorization)
- `/article <number>` - Get a specific article by number (e.g., `/article 260`)
- `/digest <number>` - Generate detailed AI-powered digest of React section with summaries, key takeaways, and recommendations (requires OpenAI API key)
- `/obsidian <number> [--overwrite]` - Generate Obsidian bundle: `<vault>/TWIR/<issue>/MOC.md` + `<vault>/TWIR/<issue>/articles/*.md` (requires `OPENAI_API_KEY` and `OBSIDIAN_VAULT_PATH`)
- `/search <query>` - Search articles by keyword across all indexed React articles (e.g., `/search hooks`)
  - Supports filters: `#262`, `issue:262`, `since:250`, `featured`, `type:item`, `limit:5`

## Development

### Hot Reload

**With Bun (`bun dev`):**

- Uses Bun's built-in `--watch` mode
- Automatically restarts on file changes
- Shows "DEVELOPMENT mode" in console
- Supports graceful shutdown

**With Node.js (`pnpm node:dev`):**

- Uses nodemon for hot reloading
- Watches `.js` and `.json` files
- Restarts on `.env` changes
- Shows "DEVELOPMENT mode" in console

### Project Structure

```
thisweekinreact-bot/
├── config/          # Configuration (env, constants)
├── handlers/        # Bot command handlers
├── middleware/      # Bot middleware (auth, rate limit, errors)
├── services/        # Business logic (scraper, articles, telegram, search)
├── utils/           # Utilities (validators, errors, logger, etc.)
├── scheduler/       # Cron jobs
├── scripts/         # Utility scripts
├── data/            # Data storage (search database)
└── docs/            # Documentation
```

### Key Utilities

- **`utils/validators.js`** - Input validation utilities
- **`utils/errors.js`** - Custom error classes for better error handling
- **`utils/logger.js`** - Logging utilities with Bun watch mode support
- **`utils/rateLimiter.js`** - Rate limiting with automatic memory cleanup
- **`utils/urlValidator.js`** - URL validation (SSRF protection)
- **`utils/stateManager.js`** - State persistence management

## Environment Variables

### Required

- `BOT_TOKEN` - Your Telegram bot token (from @BotFather)

### Optional

- `OPENAI_API_KEY` - Your OpenAI API key (optional, required only for `/digest` command). Get one at https://platform.openai.com/api-keys
- `OBSIDIAN_VAULT_PATH` - Absolute path to your Obsidian vault (optional, required for `/obsidian` command)
- `OBSIDIAN_SCRAPER_MODE` - Obsidian article extraction mode: `hybrid` (default), `python`, `playwright`, or `fast`
- `PYTHON_CLIPPER_BINARY` - Optional Python binary path for clipper worker (default: `.venv/bin/python` if present, else `python3`)
- `ALLOWED_USER_IDS` - Comma-separated list of user IDs allowed to use bot commands. If empty, all users are allowed.
- `TARGET_CHAT_IDS` - Comma-separated chat IDs for scheduled auto-delivery. If empty, scheduler checks for updates but does not auto-send.
- `HEARTBEAT_CHAT_IDS` - Comma-separated chat IDs for periodic heartbeat messages (optional)
- `HEARTBEAT_INTERVAL_MINUTES` - Heartbeat cadence in minutes; `0` disables (default: `0`)
- `CRON_TIMEZONE` - IANA timezone for scheduler (default: `UTC`, example: `America/New_York`)
- `HEALTH_HOST` - Health endpoint bind host (default: `0.0.0.0`)
- `HEALTH_PORT` - Health endpoint port (default: `3001`, set `0` to disable)
- `LOG_FORMAT` - `json` or `text` logs (default: `json`)
- `NODE_ENV` - Set to `production` for production mode (default: `development`)

## Observability

- Health endpoint: `GET /health`
- Metrics endpoint: `GET /metrics`
- `/status` includes key runtime metrics:
  - `parse_success_rate`
  - `digest_duration_ms_avg`
  - `send_failures_total`

## Docker

Build image:

```bash
docker build -t thisweekinreact-bot .
```

Run container:

```bash
docker run --env-file .env -p 3001:3001 thisweekinreact-bot
```

Container healthcheck uses the app's `/health` endpoint.

## Troubleshooting

### Obsidian Clipper Quality

For best page extraction quality, install Python clipper deps:

```bash
pip3 install requests readability-lxml markdownify beautifulsoup4 lxml
```

Optionally install Playwright Chromium as secondary fallback:

```bash
npx playwright install chromium
```

Then set:

```env
OBSIDIAN_SCRAPER_MODE=hybrid
```

### Error fetching article

If you see "Error fetching article #X", you can debug it:

```bash
# Test a specific article
bun test:article 114

# Or with Node.js
node scripts/test-article.js 114
```

This will show you:

- If the article URL is valid
- If the HTML is fetched successfully
- What headings are available in the article
- Why the React section might not be found

### Search Index

The `/search` command uses a SQLite database with FTS5 for fast keyword search. Articles are automatically indexed when:
- New articles are found via the weekly cron job
- Articles are manually checked via `/now` command

To build the search index for existing articles, you can manually fetch articles using `/article <number>` or wait for the automatic indexing when new articles arrive.

The search database is stored in `data/search.db` and is automatically created on first use.

### Digest Cache

The `/digest` command caches generated digests by issue and model in `data/digest-cache.json`.  
Repeated requests for the same issue return cached output to reduce latency and OpenAI costs.

### Common Issues

1. **"React section not found"** - The article might have a different HTML structure (older articles or special announcements)
2. **"Article not found (404)"** - The article number doesn't exist
3. **Network errors** - Check your internet connection or the site might be down
4. **Rate limit errors** - You've exceeded the rate limit (3 requests per 5 minutes). Wait a few minutes and try again.
5. **"No articles found" in search** - The search index might be empty. Try fetching some articles first using `/article <number>` to build the index.

### Error Handling

The bot uses custom error classes for better error categorization:

- **NetworkError** - Network/HTTP related errors
- **ValidationError** - Input validation errors
- **ParsingError** - HTML parsing errors
- **NotFoundError** - Resource not found errors

All errors are logged server-side with full context, while users receive user-friendly error messages.

## Architecture & Security

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed architecture information.

Key security features:

- **SSRF Protection** - URL whitelist validation
- **Rate Limiting** - Prevents abuse (3 requests per 5 minutes per user)
- **Input Validation** - All inputs are validated before processing
- **Error Handling** - No sensitive information exposed to users
- **Memory Management** - Automatic cleanup prevents memory leaks

## License

MIT
