---
name: review-code
description: Perform thorough code review checking architecture compliance, code quality, security vulnerabilities, performance, testability, and maintainability following project patterns. Use when the user asks for code review, wants changes reviewed, or requests quality assessment (e.g., "review my code", "check this implementation", "is this code good?", "review the changes")
---

# Review Code Changes

## Overview

This skill performs a comprehensive code review of changes to the Telegram bot project, ensuring they follow the established architecture, maintain code quality, avoid security vulnerabilities, and remain maintainable.

## Prerequisites

- Understanding of the project's architecture (`{baseDir}/ARCHITECTURE.md`)
- Familiarity with existing code patterns
- Knowledge of security best practices
- Access to all changed files

## Instructions

Conduct a systematic review across all these dimensions:

### Step 1: Identify What Changed

Determine what files were modified:

```bash
cd {baseDir}
git diff --name-only
```

Or ask the user which files were changed.

For each changed file, read it:
```bash
Read: {baseDir}/path/to/changed/file.js
```

### Step 2: Architecture Compliance

Verify changes respect the modular architecture:

**Module Placement:**
- ✅ Business logic → `services/`
- ✅ Command handlers → `handlers/`
- ✅ Cross-cutting concerns → `middleware/`
- ✅ Utilities → `utils/`
- ✅ Configuration → `config/`

**Separation of Concerns:**
- ✅ Handlers are thin, delegate to services
- ✅ Services contain business logic only
- ✅ No business logic in handlers
- ✅ No command handling in services

**Single Responsibility:**
- ✅ Each module has one clear purpose
- ✅ Functions do one thing well
- ✅ Classes are focused and cohesive

**DRY Principle:**
- ✅ No duplicated code
- ✅ Common logic extracted to utilities
- ✅ Reusable patterns abstracted

**Check patterns:**
```bash
# Check if handlers are thin (should be < 30 lines typically)
Read: {baseDir}/handlers/commands.js

# Check if services follow singleton pattern
grep -n "module.exports = new" {baseDir}/services/*.js
```

**Report violations:**
```
❌ Business logic found in handler (handlers/commands.js:45-60)
Recommendation: Extract to service method
```

### Step 3: Code Quality Review

Assess code quality aspects:

**Readability:**
- ✅ Clear, descriptive variable names
- ✅ Consistent naming conventions (camelCase for functions, UPPER_SNAKE_CASE for constants)
- ✅ Proper indentation and formatting
- ✅ Logical code flow, easy to follow

**Documentation:**
- ✅ JSDoc comments on exported functions
- ✅ Complex logic explained
- ✅ Non-obvious decisions documented
- ✅ README updated if needed

**Example of good JSDoc:**
```javascript
/**
 * Fetch and parse article by number
 * @param {number} articleNumber - The article number (must be positive integer)
 * @returns {Promise<string>} - Formatted article text for Telegram
 * @throws {Error} - If article not found or parse fails
 */
async getArticle(articleNumber) {
  // implementation
}
```

**Error Handling:**
- ✅ All async operations have try-catch
- ✅ Errors logged with details
- ✅ User-friendly error messages
- ✅ Graceful failure, no crashes
- ✅ No unhandled promise rejections

**Input Validation:**
- ✅ All user input validated
- ✅ Type checking (numbers, strings, etc.)
- ✅ Range checking (positive, max length, etc.)
- ✅ Format validation (URLs, IDs, etc.)

**Magic Numbers/Strings:**
- ✅ Constants defined in `config/constants.js`
- ✅ No hardcoded values scattered in code
- ✅ Environment variables in `config/env.js`

**Async/Await Usage:**
- ✅ Consistent async/await (no mixing with .then())
- ✅ All promises awaited
- ✅ No floating promises
- ✅ Proper error propagation

### Step 4: Security Review

Critical security checks:

**Input Validation:**
```bash
# Check all command handlers validate input
Read: {baseDir}/handlers/commands.js
```

Look for:
- ✅ Parameter validation before use
- ✅ Type coercion handled safely
- ✅ No direct use of user input without validation

**URL Validation:**
```bash
# Search for axios/fetch calls
grep -n "axios.get\|fetch(" {baseDir}/services/*.js
```

Verify:
- ✅ All URLs pass through `validateArticleUrl()`
- ✅ No user-controlled URLs without validation
- ✅ SSRF protection maintained

**No Hardcoded Secrets:**
```bash
# Search for potential secrets
grep -i "token\|secret\|key\|password" {baseDir}/ -r --exclude-dir=node_modules | grep -v ".env"
```

Verify:
- ✅ No hardcoded tokens, keys, passwords
- ✅ All secrets via environment variables
- ✅ No secrets in comments or logs

**SQL Injection / Command Injection:**
- ✅ No dynamic SQL (not applicable here)
- ✅ No shell command injection vectors
- ✅ No `eval()` or `Function()` usage

**Rate Limiting:**
```bash
# Check commands have rate limiting
grep -A2 "bot.command" {baseDir}/handlers/commands.js | grep rateLimitMiddleware
```

Verify:
- ✅ User-facing commands have rate limiting
- ✅ Limits are reasonable

**Authorization:**
```bash
# Check admin commands have auth
grep -A5 "isAuthorized" {baseDir}/handlers/commands.js
```

Verify:
- ✅ Admin commands check authorization
- ✅ Unauthorized users get appropriate error
- ✅ Check happens before execution

**Error Messages:**
- ✅ No stack traces to users
- ✅ No sensitive info in errors
- ✅ Generic messages for users
- ✅ Detailed logs server-side only

### Step 5: Bot-Specific Patterns

For Telegram bot changes:

**Command Registration:**
```javascript
// ✅ Correct pattern
bot.command('name', rateLimitMiddleware(), async (ctx) => {
  // handler
});

// ❌ Missing middleware
bot.command('name', async (ctx) => {
  // handler
});
```

**Context Handling:**
- ✅ Proper use of `ctx` object
- ✅ `ctx.message.text` parsed correctly
- ✅ `ctx.reply()` used appropriately

**Message Formatting:**
- ✅ Telegram markdown/HTML used correctly
- ✅ Message length limits respected
- ✅ Special characters escaped if needed

**Error Responses:**
```javascript
// ✅ Good error handling
try {
  const result = await service.work();
  await ctx.reply(result);
} catch (err) {
  console.error('Detailed error:', err);
  await ctx.reply('❌ User-friendly message');
}

// ❌ Bad - exposes stack trace
catch (err) {
  await ctx.reply(err.stack);
}
```

### Step 6: Performance Considerations

Evaluate performance impact:

**HTTP Timeouts:**
```bash
Read: {baseDir}/config/constants.js
```

Check:
- ✅ Timeout values are reasonable (not too short/long)
- ✅ Max response size limits set

**Memory Usage:**
- ✅ Large data structures handled efficiently
- ✅ No memory leaks (event listeners cleaned up)
- ✅ Streams used for large files (if applicable)

**Rate Limits:**
- ✅ Not too restrictive (good UX)
- ✅ Not too permissive (prevents abuse)
- ✅ Appropriate for bot usage patterns

**Cheerio Parsing:**
- ✅ Efficient selectors (specific, not overly broad)
- ✅ No unnecessary parsing
- ✅ Minimal DOM traversal

### Step 7: Testability

Assess how testable the code is:

**Structure:**
- ✅ Functions are pure where possible
- ✅ Dependencies can be mocked
- ✅ Business logic separated from I/O
- ✅ Small, focused functions

**Test Coverage Needs:**
- What should be tested?
- What test cases are needed?
- What edge cases exist?

**Suggest tests:**
```
Recommended tests:
1. Unit: newService.doWork() with valid input
2. Unit: newService.doWork() with invalid input
3. Integration: /newcommand with valid params
4. Integration: /newcommand with missing params
5. Edge case: /newcommand with rate limit exceeded
```

### Step 8: Maintainability

Consider long-term maintenance:

**Documentation:**
- ✅ README.md updated with new features
- ✅ Environment variables documented
- ✅ Breaking changes noted
- ✅ Migration guide if needed

**Backwards Compatibility:**
- ✅ No breaking API changes without notice
- ✅ Old functionality preserved or gracefully deprecated
- ✅ State file format compatible

**Dependencies:**
```bash
# Check if new dependencies added
git diff package.json
```

Evaluate:
- ✅ Dependency is necessary
- ✅ Dependency is well-maintained
- ✅ No security vulnerabilities
- ✅ License is compatible

**Code Patterns:**
- ✅ Consistent with existing code
- ✅ Follows project conventions
- ✅ No new patterns without good reason

### Step 9: Edge Cases

Identify edge cases to test:

**Empty/Null Values:**
- What if parameter is empty string?
- What if array is empty?
- What if response is null?

**Boundary Values:**
- Article number 0 or negative
- Very large article number
- String max length

**Error Conditions:**
- Network timeout
- Invalid response format
- Service unavailable

**Concurrent Requests:**
- Rate limiter under load
- State file concurrent writes
- Race conditions

### Step 10: Final Checklist

Provide comprehensive checklist:

- [ ] Code follows project architecture
- [ ] Module placement is correct
- [ ] Handlers are thin, delegate to services
- [ ] No security vulnerabilities
- [ ] Input validation complete
- [ ] No hardcoded secrets
- [ ] Error handling robust
- [ ] User-friendly error messages
- [ ] Rate limiting applied (if needed)
- [ ] Authorization checked (if needed)
- [ ] No code duplication
- [ ] Clear naming conventions
- [ ] JSDoc comments added
- [ ] Constants used (no magic numbers)
- [ ] Proper async/await usage
- [ ] Dependencies justified
- [ ] Documentation updated
- [ ] Breaking changes noted
- [ ] Edge cases considered
- [ ] Performance acceptable

## Output Format

Structure review as:

```markdown
# Code Review Report

## Summary
Overall assessment: ✅ Approved / ⚠️ Needs Minor Changes / ❌ Needs Major Revisions

[Brief summary of changes and overall quality]

## Strengths
What was done well:
- ✅ [Positive point 1]
- ✅ [Positive point 2]

## Issues Found

### Critical ❌
Issues that must be fixed:
1. **[Issue title]** (file.js:line)
   - Problem: [Description]
   - Impact: [Security/Bug/etc]
   - Fix: [Specific recommendation]

### Major ⚠️
Important issues that should be fixed:
1. **[Issue title]** (file.js:line)
   - Problem: [Description]
   - Recommendation: [How to fix]

### Minor 💡
Improvements and suggestions:
1. **[Issue title]** (file.js:line)
   - Suggestion: [Description]

## Recommendations

### Architecture
- [Recommendation 1]
- [Recommendation 2]

### Security
- [Recommendation 1]

### Code Quality
- [Recommendation 1]

### Testing
- [Test cases to add]

## Questions for Clarification
1. [Question about design decision]
2. [Question about implementation]

## Approval Status
- ❌ Requires changes before approval
- ⚠️ Approved with recommendations
- ✅ Approved
```

## Error Handling

**If unable to read files:**
- Note which files couldn't be accessed
- Review what's available
- Provide partial review with caveats

**If unclear about intent:**
- Ask clarifying questions
- Review against similar existing code
- Suggest alternatives

**If breaking changes found:**
- Clearly document them
- Suggest migration path
- Assess impact

## Examples

### Example 1: Missing Input Validation

**Code:**
```javascript
bot.command("search", async (ctx) => {
  const query = ctx.message.text.split(" ")[1];
  await service.search(query);
});
```

**Review:**
```
❌ CRITICAL: Missing input validation (handlers/commands.js:45)

Problems:
1. query can be undefined if no parameter provided
2. No validation of query length
3. No rate limiting applied

Fix:
const args = ctx.message.text.split(/\s+/);
if (args.length < 2 || !args[1].trim()) {
  await ctx.reply("Usage: /search <query>");
  return;
}
const query = args[1].trim();
if (query.length > 100) {
  await ctx.reply("❌ Query too long (max 100 chars)");
  return;
}
```

### Example 2: Business Logic in Handler

**Code:**
```javascript
bot.command("stats", async (ctx) => {
  const users = await db.getUsers();
  const count = users.length;
  const active = users.filter(u => u.active).length;
  await ctx.reply(`Users: ${count}, Active: ${active}`);
});
```

**Review:**
```
⚠️ MAJOR: Business logic in handler (handlers/commands.js:78-82)

Problem:
Handler contains business logic (user counting, filtering) instead of delegating to service.

Recommendation:
Create services/statsService.js:
class StatsService {
  async getUserStats() {
    const users = await db.getUsers();
    return {
      total: users.length,
      active: users.filter(u => u.active).length
    };
  }
}

Update handler:
bot.command("stats", async (ctx) => {
  const stats = await statsService.getUserStats();
  await ctx.reply(`Users: ${stats.total}, Active: ${stats.active}`);
});
```

### Example 3: Good Code

**Code:**
```javascript
bot.command("article", rateLimitMiddleware(), async (ctx) => {
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 2) {
    await ctx.reply("Usage: /article <number>");
    return;
  }

  const articleNumber = parseInt(args[1], 10);
  if (isNaN(articleNumber) || articleNumber < 1) {
    await ctx.reply("❌ Please provide a valid article number");
    return;
  }

  try {
    const text = await articleService.getArticle(articleNumber);
    await ctx.reply(text);
  } catch (err) {
    console.error(`Error fetching article:`, err);
    await ctx.reply(`❌ Failed to fetch article`);
  }
});
```

**Review:**
```
✅ EXCELLENT: Command handler follows all best practices

Strengths:
- Rate limiting applied
- Input validation comprehensive
- Delegates to service
- Error handling complete
- User-friendly error messages
- No business logic in handler
```

## Code References

- Architecture: `{baseDir}/ARCHITECTURE.md`
- Security: `{baseDir}/docs/SECURITY.md`
- Command patterns: `{baseDir}/handlers/commands.js`
- Service patterns: `{baseDir}/services/`
- Middleware: `{baseDir}/middleware/`
