class ObservabilityService {
  constructor() {
    this.reset();
  }

  reset() {
    this.metrics = {
      parse_attempts_total: 0,
      parse_success_total: 0,
      digest_total: 0,
      digest_duration_ms_total: 0,
      send_failures_total: 0,
    };
    this.startedAt = Date.now();
  }

  incParseAttempt() {
    this.metrics.parse_attempts_total += 1;
  }

  incParseSuccess() {
    this.metrics.parse_success_total += 1;
  }

  recordDigestDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.metrics.digest_total += 1;
    this.metrics.digest_duration_ms_total += durationMs;
  }

  incSendFailure() {
    this.metrics.send_failures_total += 1;
  }

  getSnapshot() {
    const parseAttempts = this.metrics.parse_attempts_total;
    const parseSuccess = this.metrics.parse_success_total;
    const digestTotal = this.metrics.digest_total;

    return {
      ...this.metrics,
      parse_success_rate: parseAttempts > 0 ? parseSuccess / parseAttempts : 1,
      digest_duration_ms_avg:
        digestTotal > 0
          ? this.metrics.digest_duration_ms_total / digestTotal
          : 0,
      uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}

module.exports = new ObservabilityService();
