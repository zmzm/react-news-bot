---
name: add-service
description: Add a new service module following the project's singleton architecture, with proper separation of concerns and integration into command handlers. Use when the user asks to add new business logic, create a new service, or implement a feature that needs its own service layer (e.g., "add analytics service", "create notification service", "implement caching")
---

# Add New Service

## Overview

This skill guides you through creating a new service in the `services/` directory following the project's singleton pattern, and wiring it into the existing architecture (handlers, config, middleware).

## Prerequisites

- Read `{baseDir}/handlers/commands.js` to understand how services are consumed
- Read at least one existing service (e.g., `{baseDir}/services/searchService.js`) for the pattern
- Understand what business logic needs to live in the service vs. the handler

## Instructions

### Step 1: Define Service Responsibility

Before writing code, clarify what belongs in the service and what doesn't:

**Belongs in the service:**
- Data fetching, transformation, and persistence
- External API calls
- Business rules and validation logic
- State management

**Does NOT belong in the service:**
- Telegram-specific logic (ctx.reply, message formatting for Telegram)
- Middleware concerns (auth, rate limiting)
- Command argument parsing

Use AskUserQuestion if the boundary is unclear:
- What data does this service manage?
- Does it need external API access?
- Does it need persistent storage?
- Which commands will use it?

### Step 2: Check for Configuration Needs

Determine if the service needs new constants or environment variables:

**New constants** → Add to `{baseDir}/config/constants.js`:
```javascript
// Example: adding cache TTL
CACHE_TTL: 60 * 60 * 1000, // 1 hour
```

**New env vars** → Add to `{baseDir}/config/env.js` with validation:
```javascript
const NEW_API_KEY = process.env.NEW_API_KEY || "";
// Add validation if required
if (requiredFeatureEnabled && !NEW_API_KEY) {
  console.error("NEW_API_KEY is required when feature X is enabled");
  process.exit(1);
}
```

Update `.env.example` with the new variable.

### Step 3: Create the Service File

Create `{baseDir}/services/<serviceName>Service.js`:

```javascript
const { RELEVANT_CONSTANT } = require("../config/constants");
// Import custom errors as needed
const { NetworkError, ValidationError } = require("../utils/errors");

class ServiceNameService {
  constructor() {
    // Initialize state, connections, etc.
    // Keep constructor lightweight — use lazy init for heavy resources
  }

  /**
   * Primary public method
   * @param {type} param - Description
   * @returns {Promise<type>} - Description
   */
  async publicMethod(param) {
    // Validate input
    // Business logic
    // Return data (NOT formatted for Telegram — that's the handler's job)
  }

  /**
   * Internal helper
   * @private
   */
  _privateHelper() {
    // Prefix private methods with underscore
  }
}

module.exports = new ServiceNameService();
```

**Key rules:**
- Export a singleton instance (`new ServiceNameService()`)
- Use custom error classes from `utils/errors.js` (NetworkError, ValidationError, ParsingError, NotFoundError)
- Prefix private methods with `_`
- Add JSDoc to all public methods
- Return raw data, not Telegram-formatted messages

### Step 4: Handle Lazy Initialization

If the service needs expensive setup (DB connections, file I/O), use lazy initialization like `searchService.js` does:

```javascript
class ServiceNameService {
  constructor() {
    this._initialized = false;
    this._resource = null;
  }

  async _initialize() {
    if (this._initialized) return;
    // Heavy setup here
    this._resource = await expensiveOperation();
    this._initialized = true;
  }

  async publicMethod(param) {
    await this._initialize();
    // Use this._resource
  }
}
```

This avoids slowing down bot startup and allows graceful degradation if the resource isn't available.

### Step 5: Add Error Handling

Follow the project's error categorization pattern:

```javascript
async fetchData(id) {
  try {
    const result = await externalCall(id);
    return result;
  } catch (err) {
    // Re-throw custom errors as-is
    if (err instanceof ValidationError || err instanceof NetworkError) {
      throw err;
    }

    // Categorize and wrap other errors
    if (err.response) {
      const status = err.response.status;
      if (status === 404) {
        throw new NotFoundError(`Resource ${id} not found`);
      }
      throw new NetworkError(`HTTP ${status}: ${err.message}`, "HTTP_ERROR", status);
    }

    if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
      throw new NetworkError(`Network error: ${err.message}`, err.code);
    }

    // Generic fallback
    console.error(`Error in ServiceName.fetchData:`, err);
    throw new Error(`Failed to fetch data: ${err.message}`);
  }
}
```

### Step 6: Integrate with Command Handler

In `{baseDir}/handlers/commands.js`:

1. Import the service at the top:
```javascript
const serviceNameService = require("../services/serviceNameService");
```

2. Use it in a command handler (keep the handler thin):
```javascript
bot.command("commandname", rateLimitMiddleware(), async (ctx) => {
  try {
    const args = parseCommandArgs(ctx.message?.text || "");
    // Validate args...

    const data = await serviceNameService.publicMethod(args[0]);

    // Format for Telegram HERE, not in the service
    const message = `Result: ${data.title}\n${data.url}`;
    await ctx.reply(message);
  } catch (err) {
    console.error("Error in /commandname:", err.message);
    await ctx.reply(`Something went wrong. Please try again.`);
  }
});
```

### Step 7: Test the Service

1. If the service can be tested standalone, create a test script:
```bash
# {baseDir}/scripts/test-<service>.js
node -e "const svc = require('./services/serviceNameService'); svc.publicMethod('test').then(console.log).catch(console.error)"
```

2. Start the bot and test through the command:
```bash
bun dev
```

3. Test edge cases:
   - Invalid input
   - Network failures (disconnect and try)
   - Empty/null responses
   - Rate limiting interaction

### Step 8: Verify Architecture Compliance

Checklist before considering the service done:

- [ ] Service is in `services/` directory
- [ ] Exports singleton instance
- [ ] No Telegram-specific code (no `ctx`, no message formatting)
- [ ] Uses custom error classes from `utils/errors.js`
- [ ] Constants in `config/constants.js`, not hardcoded
- [ ] New env vars validated in `config/env.js` and added to `.env.example`
- [ ] JSDoc on all public methods
- [ ] Private methods prefixed with `_`
- [ ] Handler stays thin — only parses args, calls service, formats reply
- [ ] URL fetching uses `validateArticleUrl()` or `validateNestedUrl()` if applicable

## Output Format

```
New Service: services/<name>Service.js

Purpose: <what it does>

Public API:
- method1(param) → returns <type>
- method2(param) → returns <type>

Configuration:
- Constants added: <list or "none">
- Env vars added: <list or "none">

Integration:
- Used by: /command1, /command2
- Handler file: handlers/commands.js

Files Changed:
- services/<name>Service.js (created)
- handlers/commands.js (modified)
- config/constants.js (modified, if applicable)
- config/env.js (modified, if applicable)
- .env.example (modified, if applicable)
```

## Error Handling

**If the service duplicates existing functionality:**
- Check if the logic should extend an existing service instead
- Services should have clear, non-overlapping responsibilities

**If the service needs cross-service communication:**
- Import the other service directly (they're singletons)
- Avoid circular dependencies — if A needs B and B needs A, extract shared logic into a utility

## Code References

- Existing services: `{baseDir}/services/`
- Command handlers: `{baseDir}/handlers/commands.js`
- Custom errors: `{baseDir}/utils/errors.js`
- Constants: `{baseDir}/config/constants.js`
- Environment config: `{baseDir}/config/env.js`
- URL validators: `{baseDir}/utils/urlValidator.js`
