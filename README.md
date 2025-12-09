# This Week In React Bot

A Telegram bot that automatically sends the React section from "This Week In React" newsletter every Thursday.

## Features

- 🤖 Automatic weekly updates every Thursday
- 📰 Fetch any article by number (`/article <number>`)
- 🔒 Security features (rate limiting, URL validation, SSRF protection)
- 🔄 Hot reload for development

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

3. Fill in your Telegram bot credentials:

```bash
BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

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

## Development

The bot uses nodemon for hot reloading during development. When running `pnpm dev`:

- Changes to `index.js` will automatically restart the bot
- Changes to `.env` will trigger a restart
- The bot will show "DEVELOPMENT mode" in the console
- Graceful shutdown is handled properly

### File Watching

Nodemon watches:

- `index.js`
- `.env` file
- Files with `.js` and `.json` extensions

Ignored files:

- `node_modules/`
- `state.json`
- Log files

## Environment Variables

### Required

- `BOT_TOKEN` - Your Telegram bot token
- `TELEGRAM_CHAT_ID` - The chat ID where messages will be sent

### Optional

- `ALLOWED_USER_IDS` - Comma-separated list of user IDs allowed to use `/now` command
- `NODE_ENV` - Set to `production` for production mode

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

1. **"React section not found"** - The article might have a different HTML structure (older articles)
2. **"Article not found (404)"** - The article number doesn't exist
3. **Network errors** - Check your internet connection or the site might be down

## Security

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture information.

## License

MIT
