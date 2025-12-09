---
name: deploy
description: Guide through deployment of the Telegram bot to various platforms including VPS, Docker, cloud platforms, with environment setup, process management, and security configuration
allowed-tools: Write, Read, AskUserQuestion
---

# Deployment Guide

## Overview

This skill guides you through deploying the This Week In React Telegram bot to production, covering various deployment platforms, environment configuration, process management, and security best practices.

## Prerequisites

- Bot tested and working locally
- Environment variables documented
- Deployment target decided (VPS, Docker, cloud platform, etc.)
- Access credentials for deployment platform

## Instructions

### Step 1: Determine Deployment Target

Use AskUserQuestion to determine where the user wants to deploy:

**Questions to ask:**
- What is your deployment target?
  - VPS/Server (with systemd or PM2)
  - Docker container
  - Cloud platform (AWS, Google Cloud, Azure)
  - PaaS (Railway, Render, Heroku, Fly.io)
  - Other

Based on their answer, follow the appropriate section below.

### Step 2: Pre-Deployment Checklist

Verify these items before deployment:

```bash
# Check all tests pass
cd {baseDir}
bun test:article 260

# Verify environment variables are documented
Read: {baseDir}/.env.example

# Ensure production dependencies only
# No devDependencies needed in production
```

**Checklist:**
- ✅ Bot works locally
- ✅ All environment variables documented in `.env.example`
- ✅ `.env` is in `.gitignore`
- ✅ No hardcoded secrets in code
- ✅ Error handling is robust
- ✅ Rate limiting configured
- ✅ Production-ready logging

### Step 3: Environment Setup

All deployment methods need these environment variables:

```bash
# Required
BOT_TOKEN=your_telegram_bot_token
NODE_ENV=production

# Optional
ALLOWED_USER_IDS=comma,separated,user,ids
```

**IMPORTANT:** Never commit `.env` to git. Use platform-specific secrets management.

### Step 4A: VPS/Server Deployment with Systemd

For Linux VPS deployment:

**Step 4A.1: Install Bun (or Node.js)**

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Or install Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Step 4A.2: Clone and Setup**

```bash
# Clone repository
git clone <repository-url>
cd thisweekinreact-bot

# Install dependencies
bun install --production
# or
npm install --production

# Create .env file
nano .env
# Add environment variables
```

**Step 4A.3: Create Systemd Service**

Create service file at `/etc/systemd/system/thisweekinreact-bot.service`:

```ini
[Unit]
Description=This Week In React Telegram Bot
After=network.target

[Service]
Type=simple
User=botuser
WorkingDirectory=/home/botuser/thisweekinreact-bot
Environment=NODE_ENV=production
EnvironmentFile=/home/botuser/thisweekinreact-bot/.env
ExecStart=/home/botuser/.bun/bin/bun run index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Step 4A.4: Start Service**

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable thisweekinreact-bot

# Start service
sudo systemctl start thisweekinreact-bot

# Check status
sudo systemctl status thisweekinreact-bot

# View logs
sudo journalctl -u thisweekinreact-bot -f
```

### Step 4B: VPS/Server Deployment with PM2

For using PM2 process manager:

**Step 4B.1: Install PM2**

```bash
npm install -g pm2
```

**Step 4B.2: Create PM2 Ecosystem File**

Create `ecosystem.config.js` in project root:

```javascript
module.exports = {
  apps: [{
    name: 'thisweekinreact-bot',
    script: 'index.js',
    interpreter: 'bun', // or 'node'
    env: {
      NODE_ENV: 'production'
    },
    env_file: '.env',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

**Step 4B.3: Start with PM2**

```bash
# Create logs directory
mkdir -p logs

# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Monitor
pm2 monit

# View logs
pm2 logs thisweekinreact-bot
```

### Step 4C: Docker Deployment

**Step 4C.1: Create Dockerfile**

Create `Dockerfile` in project root:

```dockerfile
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --production --frozen-lockfile

# Copy application
COPY . .

# Set environment
ENV NODE_ENV=production

# Run
CMD ["bun", "run", "index.js"]
```

**Step 4C.2: Create .dockerignore**

Create `.dockerignore`:

```
node_modules
.git
.env
*.log
state.json
.claude
docs
```

**Step 4C.3: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      - NODE_ENV=production
    volumes:
      - ./state.json:/app/state.json
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

**Step 4C.4: Deploy with Docker**

```bash
# Build image
docker build -t thisweekinreact-bot .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Step 4D: Railway Deployment

For Railway.app deployment:

**Step 4D.1: Prepare Project**

Ensure `package.json` has proper start script:

```json
{
  "scripts": {
    "start": "bun run index.js",
    "prod": "NODE_ENV=production bun run index.js"
  }
}
```

**Step 4D.2: Deploy to Railway**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add environment variables
railway variables set BOT_TOKEN=your_token
railway variables set NODE_ENV=production

# Deploy
railway up
```

See `{baseDir}/docs/BUN_DEPLOYMENT.md` for detailed Railway instructions.

### Step 4E: Cloud Platform (AWS, GCP, Azure)

**General steps for cloud platforms:**

**Option 1: VM Instance (EC2, Compute Engine, Virtual Machine)**
- Create VM instance
- Follow VPS deployment steps (4A or 4B)
- Configure security groups/firewall
- Set up monitoring and alerts

**Option 2: Container Service (ECS, Cloud Run, Container Instances)**
- Build Docker image
- Push to container registry
- Deploy container
- Configure environment variables
- Set up scaling and monitoring

**Option 3: Serverless (Lambda, Cloud Functions)**
- ⚠️ Note: Long-polling bots need always-on instances
- Webhook-based bots can use serverless
- Current bot uses long-polling, not ideal for serverless

### Step 5: Post-Deployment Verification

After deploying, verify the bot works:

**Step 5.1: Check Bot Status**

Send `/start` command to bot in Telegram:
```
Expected response: "Hi! I'll send you the React section from This Week In React every Thursday 🔥"
```

**Step 5.2: Test Commands**

```
/article 260
Expected: Article content displayed
```

**Step 5.3: Check Logs**

Monitor logs for errors:
- Systemd: `sudo journalctl -u thisweekinreact-bot -f`
- PM2: `pm2 logs thisweekinreact-bot`
- Docker: `docker-compose logs -f`
- Railway: `railway logs`

**Step 5.4: Verify Cron Job**

Check that the cron scheduler is running:
- Look for log message: "Scheduler initialized"
- Wait for Thursday 10:00 or trigger manual check with `/now`

### Step 6: Monitoring and Maintenance

**Set up monitoring:**

**Logs:**
- Configure log rotation (for VPS)
- Set up centralized logging (for cloud)
- Monitor error rates

**Uptime:**
- Set up health checks
- Configure restart policies
- Monitor resource usage (CPU, memory)

**Alerts:**
- Bot goes offline
- High error rates
- Resource exhaustion

**Regular maintenance:**
```bash
# Update dependencies monthly
npm audit
npm update

# Backup state file
cp state.json state.json.backup

# Review logs for issues
```

### Step 7: Security Hardening

**Production security checklist:**

- ✅ Environment variables via secrets management (not .env in repo)
- ✅ HTTPS for webhooks (if using webhooks)
- ✅ Firewall configured (only necessary ports open)
- ✅ SSH key authentication (no password login)
- ✅ Regular security updates: `apt update && apt upgrade`
- ✅ Limited user permissions (don't run as root)
- ✅ Rate limiting configured
- ✅ Dependencies regularly updated
- ✅ Monitoring and alerting active

**For VPS:**
```bash
# Create dedicated user
sudo useradd -m -s /bin/bash botuser

# Disable password authentication
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no

# Configure firewall
sudo ufw allow 22/tcp
sudo ufw enable
```

### Step 8: Backup Strategy

**What to backup:**
- `state.json` - Tracks sent articles
- `.env` - Environment variables (store securely!)
- Application code (Git repository)

**Automated backup:**
```bash
# Create backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp /path/to/state.json /backups/state_$DATE.json

# Add to crontab for daily backup
crontab -e
# Add: 0 2 * * * /path/to/backup-script.sh
```

## Output Format

Provide deployment summary:

```markdown
✅ Deployment Complete

**Platform:** [Railway/VPS/Docker/etc]

**Deployment Steps Completed:**
1. ✅ Environment variables configured
2. ✅ Application deployed
3. ✅ Bot verified working (/start successful)
4. ✅ Commands tested (/article working)
5. ✅ Monitoring configured

**Access:**
- Bot: @your_bot_name
- Logs: [command to view logs]
- Status: [command to check status]

**Environment Variables Set:**
- BOT_TOKEN: ✅ Set (not shown)
- NODE_ENV: production
- ALLOWED_USER_IDS: ✅ Set (if configured)

**Next Steps:**
1. Monitor logs for errors
2. Wait for Thursday 10:00 for automatic update
3. Set up automated backups
4. Configure alerts for downtime

**Useful Commands:**
- View logs: [command]
- Restart bot: [command]
- Check status: [command]
```

## Error Handling

**If deployment fails:**
- Check logs for specific error messages
- Verify all environment variables are set
- Check network connectivity
- Verify file permissions
- Review platform-specific documentation

**Common issues:**
- Port already in use
- Missing dependencies
- Invalid environment variables
- Permission denied errors
- Network/firewall issues

**Recovery steps:**
- Stop the service
- Review configuration
- Fix the issue
- Restart the service
- Monitor logs

## Examples

### Example 1: Simple VPS Deployment

**User:** "I have an Ubuntu VPS"

**Deployment:**
1. Install Bun
2. Clone repository
3. Create `.env` file
4. Create systemd service
5. Start and enable service
6. Verify with `/start` command

### Example 2: Quick Docker Deployment

**User:** "I want to use Docker"

**Deployment:**
1. Create Dockerfile and docker-compose.yml
2. Create `.env` file
3. Run `docker-compose up -d`
4. Check logs with `docker-compose logs -f`
5. Test with `/article` command

### Example 3: Railway Platform

**User:** "Deploy to Railway"

**Deployment:**
1. Install Railway CLI
2. Initialize project
3. Set environment variables via Railway CLI
4. Deploy with `railway up`
5. Monitor via Railway dashboard

## Code References

- Deployment docs: `{baseDir}/docs/BUN_DEPLOYMENT.md`
- Environment config: `{baseDir}/config/env.js`
- Package scripts: `{baseDir}/package.json`
- Main entry: `{baseDir}/index.js`
- Architecture: `{baseDir}/ARCHITECTURE.md`
