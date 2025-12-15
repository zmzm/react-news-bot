# This Week In React Bot

A Telegram bot that automatically sends the React section from "This Week In React" newsletter every Thursday.

## Features

- 🤖 Automatic weekly updates every Thursday at 10:00 AM
- 📰 Fetch any article by number (`/article <number>`)
- 📚 Generate detailed article digests (`/digest <number>`) - AI-powered summaries with key takeaways
- 🔒 Security features (rate limiting, URL validation, SSRF protection)
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
- `/now` - Manually check for new articles (may require authorization)
- `/article <number>` - Get a specific article by number (e.g., `/article 260`)
- `/digest <number>` - Generate detailed AI-powered digest of React section with summaries, key takeaways, and recommendations (requires OpenAI API key)

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
├── services/        # Business logic (scraper, articles, telegram)
├── utils/           # Utilities (validators, errors, logger, etc.)
├── scheduler/       # Cron jobs
├── scripts/         # Utility scripts
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

- `OPENAI_API_KEY` - Your OpenAI API key (required for `/digest` command). Get one at https://platform.openai.com/api-keys
- `ALLOWED_USER_IDS` - Comma-separated list of user IDs allowed to use `/now` command (default: all users allowed)
- `NODE_ENV` - Set to `production` for production mode (default: `development`)

## Troubleshooting

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

### Common Issues

1. **"React section not found"** - The article might have a different HTML structure (older articles or special announcements)
2. **"Article not found (404)"** - The article number doesn't exist
3. **Network errors** - Check your internet connection or the site might be down
4. **Rate limit errors** - You've exceeded the rate limit (3 requests per 5 minutes). Wait a few minutes and try again.

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
