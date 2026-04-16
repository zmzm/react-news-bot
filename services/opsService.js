const http = require("http");
const observability = require("./observabilityService");
const stateManager = require("../utils/stateManager");
const {
  HEALTH_HOST,
  HEALTH_PORT,
  HEARTBEAT_CHAT_IDS,
  HEARTBEAT_INTERVAL_MINUTES,
} = require("../config/env");
const { logInfo, logError } = require("../utils/logger");

class OpsService {
  constructor() {
    this.server = null;
    this.heartbeatTimer = null;
  }

  async _buildHealthPayload() {
    const { getSchedulerStatus } = require("../scheduler/cron");

    let state = { lastArticle: 0 };
    try {
      state = await stateManager.load();
    } catch {}

    return {
      status: "ok",
      service: "thisweekinreact-bot",
      timestamp: new Date().toISOString(),
      scheduler: getSchedulerStatus(),
      state,
      metrics: observability.getSnapshot(),
    };
  }

  async startHealthServer() {
    if (!HEALTH_PORT || Number(HEALTH_PORT) <= 0) {
      return;
    }
    if (this.server) {
      return;
    }

    this.server = http.createServer(async (req, res) => {
      if (!req.url) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", error: "Invalid request" }));
        return;
      }

      if (req.url === "/health" || req.url.startsWith("/health?")) {
        const payload = await this._buildHealthPayload();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
        return;
      }

      if (req.url === "/metrics" || req.url.startsWith("/metrics?")) {
        const payload = observability.getSnapshot();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", error: "Not found" }));
    });

    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(Number(HEALTH_PORT), HEALTH_HOST, () => {
        resolve();
      });
    });

    logInfo(`Health server listening on http://${HEALTH_HOST}:${HEALTH_PORT}`);
  }

  async _sendHeartbeat() {
    if (!HEARTBEAT_CHAT_IDS.length) return;

    try {
      const telegramService = require("./telegramService");
      const payload = await this._buildHealthPayload();
      const text = [
        "💓 Heartbeat",
        `Time: ${payload.timestamp}`,
        `Status: ${payload.status}`,
        `Last issue: #${payload.state.lastArticle}`,
        `Parse success rate: ${(payload.metrics.parse_success_rate * 100).toFixed(1)}%`,
        `Avg digest duration: ${Math.round(payload.metrics.digest_duration_ms_avg)}ms`,
        `Send failures: ${payload.metrics.send_failures_total}`,
      ].join("\n");

      for (const chatId of HEARTBEAT_CHAT_IDS) {
        try {
          await telegramService.sendMessageToChat(chatId, text, {
            disable_web_page_preview: true,
          });
        } catch (err) {
          observability.incSendFailure();
          logError(`Failed to send heartbeat to chat ${chatId}:`, err.message);
        }
      }
    } catch (err) {
      logError("Heartbeat error:", err);
    }
  }

  startHeartbeat() {
    if (!HEARTBEAT_CHAT_IDS.length) return;
    if (!HEARTBEAT_INTERVAL_MINUTES || HEARTBEAT_INTERVAL_MINUTES <= 0) return;
    if (this.heartbeatTimer) return;

    const intervalMs = HEARTBEAT_INTERVAL_MINUTES * 60 * 1000;
    this.heartbeatTimer = setInterval(() => {
      this._sendHeartbeat().catch((err) => {
        logError("Unhandled heartbeat send error:", err);
      });
    }, intervalMs);

    logInfo(
      `Heartbeat enabled: every ${HEARTBEAT_INTERVAL_MINUTES} minute(s), chats=${HEARTBEAT_CHAT_IDS.length}`
    );
  }

  async stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.server) {
      const srv = this.server;
      this.server = null;
      await new Promise((resolve) => srv.close(() => resolve()));
    }
  }
}

module.exports = new OpsService();
