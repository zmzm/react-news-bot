# Claude Code Configuration

This directory contains hooks and skills for the This Week In React bot project, structured according to Claude Code best practices.

## Skills

Skills are **prompt-based context modifiers** that provide specialized guidance for specific tasks. Each skill is a directory containing a `SKILL.md` file with YAML frontmatter.

### Available Skills

#### `test-article/`

**Description:** Test article scraping functionality by running the test script for specific article numbers, diagnosing scraping issues, and analyzing HTML structure problems.

**When to use:**

- Testing if article scraping works for specific articles
- Debugging "React section not found" errors
- Analyzing HTML structure changes
- Verifying scraper configuration

**Allowed tools:** Bash, Read, Grep

**Usage:** "test article scraping" or "use the test-article skill"

---

#### `add-command/`

**Description:** Add a new Telegram bot command following the project's architecture patterns, including proper middleware setup, input validation, and error handling.

**When to use:**

- Adding new bot commands (/stats, /help, etc.)
- Need guidance on command structure
- Ensuring architecture compliance
- Setting up middleware correctly

**Allowed tools:** Read, Edit, Write, Grep, AskUserQuestion

**Usage:** "add a new command" or "use the add-command skill"

---

#### `security-audit/`

**Description:** Perform comprehensive security audit of the Telegram bot covering environment variables, input validation, SSRF protection, rate limiting, authorization, error handling, and dependency vulnerabilities.

**When to use:**

- Before deploying to production
- After significant changes
- Regular security reviews
- Checking for vulnerabilities

**Allowed tools:** Read, Grep, Bash

**Usage:** "audit security" or "use the security-audit skill"

---

#### `deploy/`

**Description:** Guide through deployment of the Telegram bot to various platforms including VPS, Docker, cloud platforms, with environment setup, process management, and security configuration.

**When to use:**

- Deploying to production
- Setting up new environments
- Choosing deployment platform
- Configuring process managers

**Allowed tools:** Write, Read, AskUserQuestion

**Usage:** "help me deploy" or "use the deploy skill"

---

#### `debug-scraper/`

**Description:** Debug and fix article scraping issues by diagnosing HTML structure changes, testing selectors, analyzing errors, and updating parsing logic.

**When to use:**

- Scraper is failing to extract content
- HTML structure has changed
- Need to update Cheerio selectors
- Handling parse errors

**Allowed tools:** Bash, Read, Edit, Grep

**Usage:** "debug scraper" or "use the debug-scraper skill"

---

#### `review-code/`

**Description:** Perform thorough code review checking architecture compliance, code quality, security vulnerabilities, performance, testability, and maintainability following project patterns.

**When to use:**

- Before committing significant changes
- After implementing new features
- Ensuring code quality
- Checking for security issues

**Allowed tools:** Read, Grep, Bash

**Usage:** "review my code" or "use the review-code skill"

---

#### `understand-codebase/`

**Description:** Provide comprehensive overview of the codebase structure, architecture, components, data flow, configuration, and guide for navigating and extending the Telegram bot project.

**When to use:**

- New to the project
- Understanding architecture
- Learning how components interact
- Planning new features

**Allowed tools:** Read, Grep, Glob

**Usage:** "explain the codebase" or "use the understand-codebase skill"

---

#### `skill-creator/`

**Description:** Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations

**When to use:**

- Create new skill
- Update skill

**Allowed tools:** Read, Grep, Glob, Bash, Edit, Write, AskUserQuestion

**Usage:** "create new skill" or "update new skill" or "use the skill-creator to create new skill"

---

## Hooks

Hooks are shell scripts that run at specific lifecycle events.

### Available Hooks

#### `user-prompt-submit`

Runs before processing user requests.

**Checks:**

- `.env` file exists
- Required environment variables are present (BOT_TOKEN)
- Dependencies are installed (node_modules exists)

**Purpose:** Catch configuration issues early before attempting to run commands.

---

#### `pre-commit`

Runs before creating a git commit.

**Checks:**

- Prevents committing `.env` file
- Scans for hardcoded credentials in staged changes
- Warns about console.log statements

**Purpose:** Prevent accidentally committing secrets or debug code.

---

### Using Hooks

Hooks run automatically at their designated lifecycle events. They are executed by Claude Code's hook system.

**To disable a hook temporarily:**

```bash
chmod -x .claude/hooks/user-prompt-submit
```

**To re-enable:**

```bash
chmod +x .claude/hooks/user-prompt-submit
```

## Skill Structure

Each skill follows this structure:

```
skill-name/
├── SKILL.md           # Core prompt with YAML frontmatter
├── scripts/           # (Optional) Executable scripts
├── references/        # (Optional) Documentation to load
└── assets/            # (Optional) Templates and resources
```

### SKILL.md Format

Skills use YAML frontmatter for metadata:

```yaml
---
name: skill-name
description: Action-oriented description of what the skill does and when to use it
allowed-tools: Bash, Read, Write  # Optional: restrict tool access
model: sonnet  # Optional: override model
---

# Skill Content

## Overview
[High-level description]

## Prerequisites
[Requirements]

## Instructions
[Step-by-step guidance]

## Output Format
[Expected output structure]

## Error Handling
[How to handle errors]

## Examples
[Usage examples]
```

### Key Principles

**Progressive Disclosure:**

- Minimal metadata shown initially
- Full SKILL.md loaded only after selection
- Supporting resources loaded on demand

**Temporary Scope:**

- Skills modify behavior only during execution
- No persistent session-wide changes

**Security:**

- `allowed-tools` restricts what tools can be used
- Only pre-approve explicitly listed tools

**Portability:**

- Always use `{baseDir}` for file paths
- Never hardcode absolute paths

## Creating Custom Skills

To create a new skill:

1. **Create directory:**

   ```bash
   mkdir .claude/skills/my-skill
   ```

2. **Create SKILL.md with frontmatter:**

   ```yaml
   ---
   name: my-skill
   description: Clear, action-oriented description of what this skill does
   allowed-tools: Read, Write, Bash
   ---
   # My Skill

   ## Overview
   ```

3. **Structure content with clear sections:**

   - Overview
   - Prerequisites
   - Instructions (step-by-step)
   - Output Format
   - Error Handling
   - Examples

4. **Add supporting resources (optional):**

   - `scripts/` - For executable code
   - `references/` - For documentation
   - `assets/` - For templates

5. **Keep under 5,000 words**

### Best Practices for Skills

- **Description is crucial** - Claude uses this for skill selection
- **Be action-oriented** - Describe what the skill does
- **Be explicit about use cases** - When should this skill be used?
- **Use clear sections** - Overview, Prerequisites, Instructions, etc.
- **Provide examples** - Show expected usage patterns
- **Handle errors gracefully** - Document error scenarios
- **Use {baseDir}** - For all file paths (never hardcode)
- **Scope permissions** - Only request necessary tools

## Creating Custom Hooks

To create a new hook:

1. **Create shell script:**

   ```bash
   touch .claude/hooks/pre-push
   chmod +x .claude/hooks/pre-push
   ```

2. **Add hook logic:**

   ```bash
   #!/bin/bash
   # Hook: pre-push
   # Description of what this hook does

   # Your checks here
   if [ condition ]; then
     echo "Error message"
     exit 1
   fi

   exit 0
   ```

3. **Exit codes:**
   - `0` = Success (continue)
   - Non-zero = Failure (block operation)

### Available Hook Names

- `user-prompt-submit` - Before processing user requests
- `pre-commit` - Before creating commits
- `pre-push` - Before pushing to remote
- `pre-tool-call` - Before any tool is called

## Project-Specific Context

### This is a Telegram bot that:

- Sends React newsletter content automatically every Thursday
- Supports manual article fetching via commands
- Has security features (rate limiting, URL validation, SSRF protection)
- Uses modular architecture with strict separation of concerns
- Supports both Bun and Node.js runtimes

### Key Files

- `index.js` - Main entry point
- `handlers/commands.js` - Bot command definitions
- `services/articleService.js` - Article parsing logic
- `ARCHITECTURE.md` - Architecture documentation
- `CLAUDE.md` - Development guidelines

### Common Commands

```bash
bun dev                          # Start in development mode
bun prod                         # Start in production mode
bun scripts/test-article.js 260  # Test article scraping
```

## Architecture Notes

The project follows strict modular architecture:

```
config/      → Configuration and environment validation
services/    → Business logic (singleton services)
handlers/    → Bot command handlers (thin, delegate to services)
middleware/  → Cross-cutting concerns (auth, rate limiting, errors)
utils/       → Reusable utility functions
scheduler/   → Cron job definitions
```

**Key Principles:**

- Separation of concerns (business logic in services, not handlers)
- Single responsibility (each module has one purpose)
- DRY (don't repeat yourself)
- Security first (validate all inputs, never expose secrets)

## Skill Selection

Claude Code uses **language model reasoning** to match your request against skill descriptions. There's no keyword matching or embeddings - just natural language understanding.

**Tips for effective skill invocation:**

- Use natural language: "help me deploy to production"
- Be specific: "debug why article 260 isn't working"
- Ask directly: "use the test-article skill"
- Reference by purpose: "review this code for security issues"

## Documentation

For more information, see:

- `../docs/ARCHITECTURE.md` - Architecture and design patterns
- `../README.md` - Project setup and usage
- `../docs/SECURITY.md` - Security considerations
- `../docs/BUN_DEPLOYMENT.md` - Deployment guide
- `./CLAUDE.md` - Claude Code development instructions

## Advanced: Resource Bundling

Skills can include additional resources:

### scripts/

Executable code for complex operations:

```bash
skill-name/
└── scripts/
    └── process-data.py
```

Claude executes these via Bash tool when the skill instructs it to.

### references/

Text documentation loaded into context:

```bash
skill-name/
└── references/
    ├── api-docs.md
    └── schema.json
```

Claude reads these via Read tool for detailed reference.

### assets/

Templates and binary files:

```bash
skill-name/
└── assets/
    ├── template.html
    └── logo.png
```

Referenced by path but not loaded into context automatically.

## Support

If you have questions about skills or hooks:

- Read the skill's SKILL.md for detailed instructions
- Ask Claude Code for help: "how do I use the deploy skill?"
- Check the project documentation in `../docs/`
- Review existing skills for patterns and examples

---

_This configuration follows Claude Code skills best practices as of December 2024._
