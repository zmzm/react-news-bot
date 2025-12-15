---
name: security-audit
description: Perform comprehensive security audit of the Telegram bot covering environment variables, input validation, SSRF protection, rate limiting, authorization, error handling, and dependency vulnerabilities. Use when the user asks for security review, audit, or wants to check for vulnerabilities (e.g., "audit security", "check for vulnerabilities", "is this secure?", "security review")
---

# Security Audit

## Overview

This skill performs a thorough security audit of the Telegram bot application, examining all critical security aspects including secrets management, input validation, SSRF protection, authorization, and more.

## Prerequisites

- Access to all project files
- Ability to run `npm audit` or `bun audit` for dependency checks
- Understanding of common web application vulnerabilities (OWASP Top 10)

## Instructions

Perform a comprehensive security review by examining each area systematically:

### Step 1: Environment Variables & Secrets Management

**Check these files:**
- `{baseDir}/.env.example` - Should exist and be up to date
- `{baseDir}/.gitignore` - Should include `.env`
- `{baseDir}/config/env.js` - Validation logic

**Actions:**
```bash
# Check if .env is in .gitignore
grep "^\.env$" {baseDir}/.gitignore

# Search for hardcoded secrets
grep -r -i "bot_token\|api.key\|secret" {baseDir}/ --exclude-dir=node_modules --exclude-dir=.git
```

**Evaluate:**
- ✅ `.env` is in `.gitignore`
- ✅ `.env.example` exists and documents all required variables
- ✅ `config/env.js` validates environment variables on startup
- ✅ No hardcoded secrets in code
- ✅ Sensitive data is not logged

**Report findings:**
- Any hardcoded credentials found
- Missing validation in `config/env.js`
- Secrets that might be exposed in logs

### Step 2: Input Validation

**Check command handlers:**
```bash
Read: {baseDir}/handlers/commands.js
```

**Evaluate each command:**
- `/article` - Validates article number is positive integer
- `/now` - No user input (only authorization check)
- Other commands - Appropriate validation

**Look for:**
- ✅ All user input is validated before use
- ✅ Type checking (numbers, strings, etc.)
- ✅ Range checking (positive integers, reasonable lengths)
- ✅ Format validation (URLs, IDs, etc.)
- ❌ Missing validation that could cause errors or exploits

**Common issues:**
- Accepting negative numbers
- No length limits on strings
- Missing null/undefined checks
- Improper regex patterns

### Step 3: SSRF Protection

**Check URL validation:**
```bash
Read: {baseDir}/utils/urlValidator.js
```

**Evaluate:**
- ✅ `validateArticleUrl()` uses whitelist approach
- ✅ Only `thisweekinreact.com` domain allowed
- ✅ HTTPS enforced
- ✅ No user-controlled URLs without validation
- ✅ Protocol restrictions (only https://)

**Check scraper usage:**
```bash
Read: {baseDir}/services/scraper.js
```

**Verify:**
- All URLs passed through `validateArticleUrl()` before fetching
- No dynamic URL construction from user input without validation
- Axios configured with appropriate limits

**Test for bypasses:**
- URL encoding tricks
- Protocol confusion
- DNS rebinding (mitigated by whitelist)
- Open redirects

### Step 4: Rate Limiting

**Check implementation:**
```bash
Read: {baseDir}/utils/rateLimiter.js
Read: {baseDir}/middleware/rateLimit.js
```

**Evaluate:**
- ✅ Rate limiter class properly implemented
- ✅ In-memory storage (acceptable for small bot)
- ✅ Configurable window and max requests
- ✅ Applied to user-facing commands
- ⚠️  In-memory rate limiter resets on bot restart (note limitation)

**Check application:**
```bash
grep -n "rateLimitMiddleware" {baseDir}/handlers/commands.js
```

**Verify:**
- `/article` command has rate limiting
- `/now` command has rate limiting
- Rate limits are reasonable (not too restrictive, not too permissive)

**Recommendations:**
- Consider persistent storage for rate limits (Redis, database)
- Different limits for different commands
- Exponential backoff for repeated violations

### Step 5: Authorization

**Check authorization middleware:**
```bash
Read: {baseDir}/middleware/auth.js
```

**Evaluate:**
- ✅ `isAuthorized()` checks user ID against whitelist
- ✅ `ALLOWED_USER_IDS` configurable via environment
- ✅ Applied to admin commands (`/now`)
- ✅ Proper error messages for unauthorized access

**Check for bypass opportunities:**
- Can user ID be spoofed? (No, Telegram validates)
- Are there unprotected admin endpoints?
- Is authorization checked before executing sensitive operations?

**Verify protection:**
```bash
grep -A5 "/now" {baseDir}/handlers/commands.js
```

Should see authorization check immediately after rate limiting.

### Step 6: Error Handling

**Check error middleware:**
```bash
Read: {baseDir}/middleware/errorHandler.js
```

**Evaluate:**
- ✅ Global error handler registered
- ✅ Errors logged server-side
- ✅ User-friendly messages sent to users
- ✅ Stack traces not exposed to users

**Check command handlers:**
Look for proper try-catch blocks with:
- Detailed logging (server-side)
- Generic error messages (user-side)
- No sensitive information in error messages

**Common issues:**
- Stack traces sent to users
- Detailed error messages revealing system info
- Unhandled promise rejections
- Missing try-catch blocks

### Step 7: Dependencies

**Run dependency audit:**
```bash
cd {baseDir}
npm audit
# or
bun audit
```

**Review package.json:**
```bash
Read: {baseDir}/package.json
```

**Evaluate:**
- Check for known vulnerabilities
- Review severity levels
- Identify outdated packages
- Assess unnecessary dependencies

**Report:**
- Critical/High severity vulnerabilities
- Outdated packages with security implications
- Recommend updates or alternatives

### Step 8: Code Injection

**Search for dangerous patterns:**
```bash
grep -r "eval\|Function(" {baseDir}/ --exclude-dir=node_modules
grep -r "child_process\|exec\|spawn" {baseDir}/ --exclude-dir=node_modules
```

**Evaluate:**
- ✅ No `eval()` usage
- ✅ No `Function()` constructor
- ✅ No dynamic code execution from user input
- ✅ No command injection vectors

**If found, assess:**
- Is the input sanitized?
- Is it from a trusted source?
- Can it be replaced with safer alternatives?

### Step 9: DoS Protection

**Check timeout configuration:**
```bash
Read: {baseDir}/config/constants.js
```

**Evaluate:**
- ✅ HTTP timeout configured (prevents hanging requests)
- ✅ Max response size limited (prevents memory exhaustion)
- ✅ Rate limiting (prevents request floods)
- ✅ Resource cleanup in error cases

**Check axios configuration:**
```bash
Read: {baseDir}/services/scraper.js
```

**Verify:**
- `timeout` set appropriately
- `maxContentLength` and `maxBodyLength` configured
- Status validation to reject error responses early

### Step 10: Production Configuration

**Check environment handling:**
```bash
Read: {baseDir}/index.js
Read: {baseDir}/config/env.js
```

**Evaluate:**
- ✅ `NODE_ENV=production` check implemented
- ✅ Different behavior for dev vs prod
- ✅ Debug logging disabled in production
- ✅ Graceful shutdown handling

**Security best practices:**
- Secrets via environment variables, not files
- Production logs don't contain sensitive data
- Error details hidden in production
- Monitoring and alerting configured

## Output Format

Provide a comprehensive security report:

```markdown
# Security Audit Report
Date: YYYY-MM-DD

## Executive Summary
[Overall security posture - Good/Fair/Poor]
[Number of issues found by severity]

## 1. Environment Variables & Secrets ✅/⚠️/❌
**Status:** [Good/Needs Improvement/Critical]

Findings:
- ✅ What's done well
- ⚠️  Potential improvements
- ❌ Critical issues (if any)

Recommendations:
1. Specific action items

## 2. Input Validation ✅/⚠️/❌
[Same format as above]

## 3. SSRF Protection ✅/⚠️/❌
[Same format]

## 4. Rate Limiting ✅/⚠️/❌
[Same format]

## 5. Authorization ✅/⚠️/❌
[Same format]

## 6. Error Handling ✅/⚠️/❌
[Same format]

## 7. Dependencies ✅/⚠️/❌
[Same format]

## 8. Code Injection ✅/⚠️/❌
[Same format]

## 9. DoS Protection ✅/⚠️/❌
[Same format]

## 10. Production Configuration ✅/⚠️/❌
[Same format]

## Priority Action Items

### Critical (Fix Immediately)
1. [Issue and fix]

### High (Fix Soon)
1. [Issue and fix]

### Medium (Plan to Fix)
1. [Issue and fix]

### Low (Consider)
1. [Issue and fix]

## Conclusion
[Overall assessment and recommendations]
```

## Error Handling

If a file cannot be read:
- Note the missing file in the report
- Assess if this is a security concern
- Continue with other checks

If a tool is not available:
- Skip that specific check
- Note limitation in report
- Recommend manual review

## Examples

### Example 1: Finding Hardcoded Secret

**Search result:**
```javascript
// services/telegramService.js:15
const BOT_TOKEN = "123456:ABC-DEF-GHI"; // ❌ HARDCODED!
```

**Report:**
```
❌ CRITICAL: Hardcoded bot token found in services/telegramService.js:15

Recommendation:
1. Remove hardcoded token immediately
2. Use process.env.BOT_TOKEN via config/env.js
3. Rotate the compromised token
4. Update pre-commit hook to catch this
```

### Example 2: Missing Input Validation

**Command handler:**
```javascript
bot.command("search", async (ctx) => {
  const query = ctx.message.text.split(" ")[1];
  await service.search(query); // ❌ No validation!
});
```

**Report:**
```
⚠️  HIGH: Missing input validation in /search command

Issues:
- No check if query exists (can be undefined)
- No length validation (could be very long)
- No sanitization

Recommendation:
1. Add null/undefined check
2. Limit query length to reasonable size (e.g., 100 chars)
3. Sanitize input before passing to service
```

### Example 3: Dependency Vulnerability

**Audit output:**
```
axios  <0.21.3
Severity: high
Server-Side Request Forgery in axios
```

**Report:**
```
❌ HIGH: axios vulnerability (SSRF)

Current version: 0.21.0
Fixed in: 0.21.3

Recommendation:
1. Update axios: npm update axios
2. Test scraper functionality after update
3. Regular dependency audits (weekly)
```

## Code References

- Environment config: `{baseDir}/config/env.js`
- Constants: `{baseDir}/config/constants.js`
- URL validator: `{baseDir}/utils/urlValidator.js`
- Rate limiter: `{baseDir}/utils/rateLimiter.js`
- Auth middleware: `{baseDir}/middleware/auth.js`
- Error handler: `{baseDir}/middleware/errorHandler.js`
- Command handlers: `{baseDir}/handlers/commands.js`
- Security docs: `{baseDir}/docs/SECURITY.md`
