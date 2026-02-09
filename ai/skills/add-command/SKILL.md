---
name: add-command
description: Add a new Telegram bot command following the project's architecture patterns, including proper middleware setup, input validation, and error handling. Use when the user asks to add, create, or implement a new bot command (e.g., "add a /stats command", "create a new /help command", "implement a /search feature")
---

# Add New Bot Command

## Overview

This skill guides you through adding a new command to the Telegram bot while following the project's modular architecture, security best practices, and established code patterns.

## Prerequisites

- Familiarity with the project's architecture (read `{baseDir}/ARCHITECTURE.md`)
- Understanding of existing command patterns in `{baseDir}/handlers/commands.js`
- Knowledge of which services and utilities are available

## Instructions

### Step 1: Gather Requirements

Use the AskUserQuestion tool to collect essential information:

**Required Information:**
- Command name (e.g., `stats`, `help`, `subscribe`)
- Command purpose and functionality
- Whether it requires authorization (admin-only)
- Whether it needs rate limiting
- What parameters it accepts (if any)
- Expected user experience and output format

**Example Questions:**
```
1. What should the command be called? (e.g., /stats)
2. What should this command do?
3. Should this command be restricted to authorized users only?
4. What parameters should it accept? (e.g., /command <param>)
```

### Step 2: Review Existing Patterns

Before writing code, read the existing command handler file:

```bash
Read: {baseDir}/handlers/commands.js
```

Observe the established patterns:
- Command registration: `bot.command('name', middleware..., handler)`
- Middleware application: `rateLimitMiddleware()`, `isAuthorized(ctx)`
- Error handling: try-catch blocks with user-friendly messages
- Input validation: Parsing and validating command arguments
- Service delegation: Handlers stay thin, business logic in services

### Step 3: Plan the Implementation

Determine what's needed:

**For Simple Commands (no new business logic):**
- Just add handler to `handlers/commands.js`
- Use existing services and utilities

**For Complex Commands (new functionality):**
- Create new service in `services/` directory (see `add-service` skill)
- Follow singleton pattern like existing services
- Export service instance: `module.exports = new ServiceClass();`

**For Multi-Service Commands (like `/digest` or `/article`):**
- Command may call multiple services sequentially
- Non-critical service calls (e.g., search indexing) should be wrapped in try-catch so failures don't break the main command
- See `/article` handler for this pattern: article fetch + search indexing where indexing failure is non-blocking

**Middleware Requirements:**
- Rate limiting: Apply `rateLimitMiddleware()` to prevent abuse
- Authorization: Check `isAuthorized(ctx)` for admin commands
- Error handling: Already applied globally, but use try-catch in handlers

### Step 4: Implement the Command

Add the command handler to `{baseDir}/handlers/commands.js`:

**Basic Command Pattern:**
```javascript
// /commandname - Description of what it does
bot.command("commandname", rateLimitMiddleware(), async (ctx) => {
  try {
    // Input validation
    const args = ctx.message.text.split(/\s+/);
    if (args.length < 2) {
      await ctx.reply("Usage: /commandname <parameter>");
      return;
    }

    // Parse and validate input
    const param = args[1];
    if (!isValid(param)) {
      await ctx.reply("❌ Invalid parameter. Please provide...");
      return;
    }

    // Delegate to service for business logic
    const result = await someService.doWork(param);

    // Send response
    await ctx.reply(result);
  } catch (err) {
    console.error(`Error in /commandname:`, err.message);
    await ctx.reply(`❌ Failed to execute command. Please try again.`);
  }
});
```

**Admin-Only Command Pattern:**
```javascript
bot.command("admin", rateLimitMiddleware(), async (ctx) => {
  // Check authorization first
  if (!isAuthorized(ctx)) {
    await ctx.reply("❌ You don't have permission to execute this command.");
    return;
  }

  try {
    // Command logic here
    await adminService.doAdminThing();
    await ctx.reply("✅ Done!");
  } catch (err) {
    console.error(`Error in /admin:`, err.message);
    await ctx.reply(`❌ Something went wrong.`);
  }
});
```

### Step 5: Create New Service (If Needed)

If the command requires new business logic, create a service:

**Service Structure (`services/newService.js`):**
```javascript
const { SOME_CONSTANT } = require("../config/constants");

class NewService {
  /**
   * Description of what this method does
   * @param {string} param - Parameter description
   * @returns {Promise<string>} - Return value description
   */
  async doWork(param) {
    // Validate input
    if (!param) {
      throw new Error("Parameter is required");
    }

    // Business logic here
    const result = await this.processData(param);

    return result;
  }

  async processData(data) {
    // Implementation
  }
}

module.exports = new NewService();
```

Then import in `handlers/commands.js`:
```javascript
const newService = require("../services/newService");
```

### Step 6: Add Input Validation

Always validate user input:

```javascript
// For numeric parameters
const number = parseInt(args[1], 10);
if (isNaN(number) || !Number.isInteger(number) || number < 1) {
  await ctx.reply("❌ Please provide a valid positive number.");
  return;
}

// For string parameters
const text = args.slice(1).join(" ");
if (!text || text.trim().length === 0) {
  await ctx.reply("❌ Please provide text after the command.");
  return;
}

// For URLs (if accepting URLs)
const url = validateArticleUrl(args[1]); // Throws if invalid
```

### Step 7: Add Error Handling

Follow the project's error handling pattern:

```javascript
try {
  // Command logic
  const result = await service.doWork();
  await ctx.reply(result);
} catch (err) {
  // Log detailed error server-side
  console.error(`Error in /command:`, err.message);
  console.error("Full error:", err);

  // Send user-friendly message
  const friendlyMessage = err.message || "Unknown error occurred";
  await ctx.reply(`❌ ${friendlyMessage}\n\nPlease try again later.`);
}
```

### Step 8: Update Documentation

Update `{baseDir}/README.md` to document the new command:

```markdown
## Commands

- `/start` - Check if the bot is alive
- `/now` - Manually check for new articles (admin only)
- `/article <number>` - Get a specific article by number
- `/digest <number>` - Generate AI-powered digest (requires OPENAI_API_KEY)
- `/search <query>` - Search indexed articles by keyword
- `/newcommand <param>` - Description of what the new command does
```

If the command uses new environment variables, update:
1. `{baseDir}/.env.example` with the new variable
2. `{baseDir}/config/env.js` to validate it
3. README.md Environment Variables section

### Step 9: Test the Command

Test thoroughly:

```bash
# Start bot in development mode
cd {baseDir}
bun dev
```

**Test Cases:**
1. ✅ Happy path with valid input
2. ❌ Invalid input (wrong type, format, etc.)
3. ❌ Missing parameters
4. ❌ Unauthorized access (if admin command)
5. ❌ Rate limit exceeded (send many requests)
6. ❌ Service error (simulate error condition)

### Step 10: Code Review

Verify the implementation:

- [ ] Command handler added to `handlers/commands.js`
- [ ] Middleware applied appropriately (rate limit, auth)
- [ ] Input validation comprehensive
- [ ] Error handling with user-friendly messages
- [ ] Business logic delegated to service (not in handler)
- [ ] Service follows singleton pattern (if created)
- [ ] JSDoc comments added to service methods
- [ ] README.md updated with new command
- [ ] Environment variables documented (if added)
- [ ] Tested all edge cases

## Output Format

After implementation, provide a summary:

```
✅ New Command Implemented: /commandname

📋 Changes Made:
- Added command handler in handlers/commands.js:XX
- [If applicable] Created new service: services/newService.js
- Updated README.md with command documentation
- [If applicable] Added environment variable to .env.example

🔒 Security:
- Rate limiting: ✅ Applied
- Authorization: ✅ Required / ❌ Not needed
- Input validation: ✅ Implemented

📝 Usage:
/commandname <param> - Description

🧪 Testing:
Please test the following scenarios:
1. Valid input: /commandname validparam
2. Invalid input: /commandname invalid
3. Missing param: /commandname
4. [Other test cases...]
```

## Error Handling

**If command already exists:**
- Inform user that command exists
- Offer to modify existing command or choose different name

**If service creation fails:**
- Review error message
- Check file permissions
- Verify directory structure

**If integration fails:**
- Review import statements
- Check for syntax errors
- Verify service exports correctly

## Examples

### Example 1: Simple Info Command

**User Request:** "Add a /help command that shows all available commands"

**Implementation:**
```javascript
bot.command("help", async (ctx) => {
  const helpText = `
📖 Available Commands:

/start - Check if bot is alive
/article <number> - Get specific article
/digest <number> - AI-powered digest (requires OpenAI)
/search <query> - Search indexed articles
/now - Check for new articles (admin only)
/help - Show this help message
  `.trim();

  await ctx.reply(helpText);
});
```

### Example 2: Admin Command with Service

**User Request:** "Add a /stats command for admins to see bot statistics"

**Steps:**
1. Create `services/statsService.js` with methods to collect stats
2. Add command handler with authorization check
3. Apply rate limiting
4. Update README.md

### Example 3: Command with Optional Dependencies

**User Request:** "Add a command that requires an optional API key"

**Pattern (see `/digest` handler for real example):**
1. Check if required config exists at the start of the handler
2. Return early with helpful message if not configured
3. Proceed with normal flow if config is present

```javascript
bot.command("feature", rateLimitMiddleware(), async (ctx) => {
  if (!SOME_API_KEY) {
    await ctx.reply("❌ This feature requires SOME_API_KEY in environment variables.");
    return;
  }
  // ... rest of handler
});
```

## Code References

- Command handlers: `{baseDir}/handlers/commands.js`
- Services directory: `{baseDir}/services/`
- Middleware: `{baseDir}/middleware/`
- Architecture docs: `{baseDir}/ARCHITECTURE.md`
- Security docs: `{baseDir}/docs/SECURITY.md`
