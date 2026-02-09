---
name: monitor-bot
description: Diagnose why the bot is not working, not sending scheduled messages, or behaving unexpectedly. Use when the user reports the bot is down, missed a Thursday send, commands aren't responding, or asks to check bot health (e.g., "bot didn't send today", "is the bot running", "why no message on Thursday", "bot health check")
---

# Monitor & Diagnose Bot

## Overview

This skill provides a systematic checklist to diagnose why the bot isn't working as expected. It covers process health, state integrity, cron scheduling, network access, and common failure modes.

## Prerequisites

- SSH or terminal access to the machine running the bot
- Access to the project directory at `{baseDir}`

## Instructions

### Step 1: Check if the Bot Process is Running

```bash
# Check for running bot process
ps aux | grep "index.js" | grep -v grep

# If using PM2
pm2 list

# If using systemd
systemctl status thisweekinreact-bot
```

**If not running:**
- Check logs for crash reason
- Look for port conflicts or missing env vars
- Restart: `cd {baseDir} && bun start` (or `bun prod` for production)

**If running but unresponsive:**
- The bot may be stuck. Check memory/CPU: `top -p $(pgrep -f "index.js")`
- Consider restarting the process

### Step 2: Check Bot Logs

```bash
# Recent output (if running in foreground or PM2)
pm2 logs thisweekinreact-bot --lines 50

# Or check system journal
journalctl -u thisweekinreact-bot --since "1 hour ago"

# Look for specific errors
grep -i "error\|fail\|crash\|unhandled" /path/to/bot.log
```

Key things to look for:
- `Unhandled Rejection` — async error not caught
- `SIGTERM`/`SIGINT` — process was killed
- `Failed to launch bot` — startup failure
- `CRON:` messages — whether scheduled checks ran
- `Error in checkAndSend` — article checking failed

### Step 3: Verify Environment Variables

```bash
cd {baseDir}

# Check .env exists and has required vars
ls -la .env

# Verify BOT_TOKEN is set (don't print the actual value)
grep -c "BOT_TOKEN=" .env

# Check if ALLOWED_USER_IDS is configured (for /now command)
grep "ALLOWED_USER_IDS" .env
```

**Common issues:**
- `.env` file missing → `cp .env.example .env` and fill in values
- `BOT_TOKEN` invalid → bot won't start at all
- `ALLOWED_USER_IDS` empty → `/now` command allows everyone (may be intentional)

### Step 4: Check State File

Read the current state to understand what the bot thinks is the latest article:

```bash
cat {baseDir}/state.json
```

Expected format:
```json
{
  "lastArticle": 263
}
```

**Possible problems:**
- File missing → bot will treat article 0 as last, should auto-recover
- `lastArticle` is ahead of actual latest → bot thinks it already sent, won't send again
- File corrupted (invalid JSON) → bot falls back to `lastArticle: 0`
- File not writable → bot can't save state after sending

**Fix manually if needed:**
```bash
# Set to a specific article number (e.g., to re-trigger sending)
echo '{"lastArticle": 262}' > {baseDir}/state.json
```

### Step 5: Verify Cron is Working

The bot uses `node-cron` (in-process, not system cron). It only runs while the bot process is alive.

```bash
# Check the schedule in config
grep "CRON_SCHEDULE" {baseDir}/config/constants.js
```

Current schedule: `"0 10 * * 4"` = every Thursday at 10:00 server time.

**Common issues:**
- **Bot wasn't running on Thursday** → cron didn't fire, no catch-up mechanism
- **Server timezone mismatch** → 10:00 in server time may not be when you expect
- **Bot restarted after 10:00 Thursday** → missed the window until next Thursday

**Check server timezone:**
```bash
date
timedatectl
```

**Workaround — trigger manually:**
Use the `/now` command in Telegram (requires ALLOWED_USER_IDS authorization).

### Step 6: Test Network Access to Newsletter Site

```bash
# Check if the site is reachable
curl -s -o /dev/null -w "%{http_code}" https://thisweekinreact.com/newsletter

# Should return 200
```

**If not 200:**
- Site may be down → wait and retry
- DNS issues → check `/etc/resolv.conf`
- Firewall blocking outbound HTTPS → check iptables/ufw rules
- SSL certificate issues → check with `curl -v`

### Step 7: Test Article Fetching

```bash
cd {baseDir}
bun scripts/test-article.js 260
```

This tests the full scraping pipeline without sending to Telegram. Check:
- URL construction works
- HTTP fetch succeeds
- React section is found
- Items are parsed correctly

**If this fails but network is fine** → selectors are broken, use the `migrate-selectors` skill.

### Step 8: Test Telegram API Connectivity

```bash
# Quick check if bot token is valid (uses Telegram getMe API)
curl -s "https://api.telegram.org/bot$(grep BOT_TOKEN {baseDir}/.env | cut -d= -f2)/getMe"
```

Expected: JSON with `"ok": true` and bot username.

**If fails:**
- Token is invalid or revoked → generate new token via @BotFather
- Telegram API is blocked in your region → need proxy/VPN
- Network issue → check Step 6

### Step 9: Check Search Database (if /search is broken)

```bash
# Check if database file exists
ls -la {baseDir}/data/search.db

# Check file size (should be > 0 if articles are indexed)
du -h {baseDir}/data/search.db
```

**If missing or empty:**
- Articles haven't been indexed yet
- Fetch a few articles with `/article` command to populate
- Check if `data/` directory is writable

### Step 10: Verify Disk Space and Permissions

```bash
# Check disk space
df -h {baseDir}

# Check file permissions
ls -la {baseDir}/state.json
ls -la {baseDir}/data/

# state.json must be writable by bot process
# data/ directory must be writable for search.db
```

## Output Format

Present findings as a diagnostic report:

```
Bot Health Report

Process:    [Running/Stopped] — PID: XXXX
Uptime:     X hours
Environment: [development/production]

State:
  lastArticle: #263
  state.json:  [OK/Missing/Corrupted/Not writable]

Cron:
  Schedule:   Thursday 10:00 (server time)
  Server TZ:  UTC
  Last run:   [timestamp or "unknown"]
  Status:     [OK/Missed/Not running]

Network:
  thisweekinreact.com: [Reachable/Down/Blocked]
  api.telegram.org:    [Reachable/Down/Blocked]
  Bot token:           [Valid/Invalid]

Scraping:
  Test article #260:   [OK/Failed — reason]
  React section:       [Found/Not found]
  Items parsed:        X items

Search DB:
  File:    [Exists/Missing] — X KB
  Articles indexed: X

Disk:
  Space available: X GB
  Permissions:     [OK/Issues]

Diagnosis: <summary of what's wrong>
Recommended Fix: <specific action to take>
```

## Error Handling

**If you can't access the server:**
- Ask user for log output
- Guide them through the steps manually
- Focus on what can be checked remotely (Telegram API, site availability)

**If multiple issues found:**
- Fix in order: process → env → network → state → scraping
- Don't attempt to fix scraping if the process isn't even running

## Code References

- Entry point: `{baseDir}/index.js`
- Cron scheduler: `{baseDir}/scheduler/cron.js`
- State management: `{baseDir}/utils/stateManager.js`
- State file: `{baseDir}/state.json`
- Bot lifecycle: `{baseDir}/services/telegramService.js`
- Article checking: `telegramService.checkAndSend()` method
- Config: `{baseDir}/config/constants.js` (CRON_SCHEDULE)
- Env validation: `{baseDir}/config/env.js`
- Test script: `{baseDir}/scripts/test-article.js`
