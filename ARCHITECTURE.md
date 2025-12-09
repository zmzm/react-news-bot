# Architecture Documentation

This document describes the modular architecture of the This Week In React bot.

## Directory Structure

```
thisweekinreact-bot/
├── config/           # Configuration files
│   ├── env.js       # Environment variable validation
│   └── constants.js # Application constants
├── utils/           # Utility modules
│   ├── urlValidator.js  # URL validation utilities
│   ├── rateLimiter.js   # Rate limiting logic
│   └── stateManager.js  # State file management
├── services/        # Business logic services
│   ├── scraper.js        # Web scraping service
│   ├── articleService.js # Article parsing and formatting
│   └── telegramService.js # Telegram bot operations
├── middleware/       # Bot middleware
│   ├── errorHandler.js # Error handling middleware
│   ├── auth.js         # Authorization middleware
│   └── rateLimit.js    # Rate limiting middleware
├── handlers/        # Command handlers
│   └── commands.js  # Bot command definitions
├── scheduler/       # Scheduled tasks
│   └── cron.js     # Cron job scheduler
└── index.js         # Main entry point
```

## Module Responsibilities

### Config (`config/`)

**env.js**
- Validates environment variables on startup
- Exports validated configuration values
- Ensures required variables are present

**constants.js**
- Centralizes all application constants
- File paths, timeouts, limits, schedules
- Single source of truth for configuration values

### Utils (`utils/`)

**urlValidator.js**
- `validateArticleUrl()` - Strict validation for article URLs (SSRF protection)
- `validateNestedUrl()` - Permissive validation for external links
- Prevents security vulnerabilities

**rateLimiter.js**
- Rate limiting class with in-memory storage
- Tracks requests per user
- Configurable window and max requests

**stateManager.js**
- Atomic file operations for state persistence
- Loads and saves bot state
- Handles file errors gracefully

### Services (`services/`)

**scraper.js**
- HTTP client configuration
- Fetches HTML content from URLs
- Parses HTML with Cheerio
- Gets latest article URL from newsletter page

**articleService.js**
- Parses React section from articles
- Extracts featured articles and list items
- Formats messages for Telegram
- Handles message truncation

**telegramService.js**
- Manages Telegram bot instance
- Sends messages to configured chat
- Checks for new articles and sends notifications
- Bot lifecycle management (launch/stop)

### Middleware (`middleware/`)

**errorHandler.js**
- Catches and handles bot errors
- Sends user-friendly error messages
- Logs errors for debugging

**auth.js**
- Authorization checks
- Validates user permissions
- Configurable allowed user IDs

**rateLimit.js**
- Rate limiting middleware factory
- Applies rate limits to commands
- Returns rate limit error messages

### Handlers (`handlers/`)

**commands.js**
- Registers all bot commands
- `/start` - Welcome message
- `/now` - Manual check for new articles
- `/article <number>` - Get specific article
- Applies middleware (auth, rate limiting)

### Scheduler (`scheduler/`)

**cron.js**
- Configures cron jobs
- Schedules weekly article checks
- Runs on Thursdays at 10:00

### Main Entry Point (`index.js`)

- Initializes bot
- Registers middleware and commands
- Sets up error handlers
- Handles graceful shutdown
- Starts scheduler

## Design Principles

### Separation of Concerns
Each module has a single, well-defined responsibility. Business logic is separated from infrastructure concerns.

### Dependency Injection
Services are exported as singletons but can be easily mocked for testing. Dependencies are explicit through require statements.

### Single Responsibility Principle
Each class/function does one thing well:
- `Scraper` - Only handles HTTP requests and HTML parsing
- `ArticleService` - Only handles article parsing and formatting
- `TelegramService` - Only handles Telegram operations

### DRY (Don't Repeat Yourself)
Common functionality is extracted into reusable utilities:
- URL validation logic is centralized
- Rate limiting is reusable middleware
- State management is abstracted

### Security First
- URL validation prevents SSRF attacks
- Rate limiting prevents abuse
- Authorization middleware protects sensitive commands
- Input validation throughout

## Benefits of This Architecture

1. **Maintainability** - Easy to find and modify code
2. **Testability** - Modules can be tested in isolation
3. **Scalability** - Easy to add new features or commands
4. **Readability** - Clear structure and organization
5. **Reusability** - Utilities can be reused across modules
6. **Security** - Security concerns are centralized

## Adding New Features

### Adding a New Command

1. Add command handler in `handlers/commands.js`
2. Apply middleware as needed (auth, rateLimit)
3. Use services for business logic

### Adding a New Service

1. Create new file in `services/`
2. Export singleton instance
3. Import and use in handlers or other services

### Adding Configuration

1. Add to `config/constants.js` for constants
2. Add to `config/env.js` for environment variables

## Testing Strategy

Each module can be tested independently:
- Mock dependencies
- Test in isolation
- Integration tests for service interactions

## Future Improvements

- Add unit tests for each module
- Add integration tests
- Consider dependency injection container
- Add logging service
- Add metrics/monitoring service

