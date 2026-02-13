FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY . .

ENV NODE_ENV=production \
    LOG_FORMAT=json \
    HEALTH_HOST=0.0.0.0 \
    HEALTH_PORT=3001

EXPOSE 3001

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["sh", "-c", "node -e \"fetch('http://127.0.0.1:' + (process.env.HEALTH_PORT || 3001) + '/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]

CMD ["node", "index.js"]
