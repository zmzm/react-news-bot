const { ALLOWED_DOMAINS } = require("../config/constants");
const dns = require("dns").promises;
const net = require("net");

function isPrivateIPv4(ip) {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("127.") ||
    ip.startsWith("169.254.") ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip) ||
    ip.startsWith("192.168.") ||
    ip === "0.0.0.0" ||
    ip.startsWith("100.64.")
  );
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("::ffff:")
  );
}

function isBlockedIp(hostname) {
  const ipType = net.isIP(hostname);
  if (!ipType) return false;
  if (ipType === 4) return isPrivateIPv4(hostname);
  return isPrivateIPv6(hostname);
}

/**
 * Strict validation for article URLs (prevents SSRF)
 * Only allows thisweekinreact.com domain
 * 
 * @param {string} url - URL to validate
 * @returns {string} - Validated URL string
 * @throws {Error} - If URL is invalid or not allowed
 */
function validateArticleUrl(url) {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== "https:") {
      throw new Error(
        `Invalid protocol: ${parsed.protocol}. Only HTTPS allowed.`
      );
    }

    // Check if domain is allowed
    const domain = parsed.hostname.toLowerCase();
    const isAllowed = ALLOWED_DOMAINS.some(
      (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
    );

    if (!isAllowed) {
      throw new Error(`Domain ${domain} is not allowed`);
    }

    return parsed.toString();
  } catch (err) {
    throw new Error(`Invalid URL: ${err.message}`);
  }
}

/**
 * Permissive validation for nested links in articles
 * Allows external domains but enforces HTTPS and basic security
 * Blocks localhost and private IP ranges
 * 
 * @param {string} url - URL to validate
 * @returns {string} - Validated URL string
 * @throws {Error} - If URL is invalid or contains blocked domains
 */
function validateNestedUrl(url) {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS and HTTP (some sites may still use HTTP)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(
        `Invalid protocol: ${parsed.protocol}. Only HTTP/HTTPS allowed.`
      );
    }

    // Block dangerous protocols and localhost/internal IPs
    const rawHostname = parsed.hostname.toLowerCase();
    // Strip brackets from IPv6 addresses (some runtimes keep them)
    const hostname = rawHostname.replace(/^\[|\]$/g, "");

    // Block localhost and private IP ranges
    const isLocalhost = hostname === "localhost" || hostname.endsWith(".localhost");
    const isPrivateIP = isBlockedIp(hostname);

    if (parsed.username || parsed.password) {
      throw new Error("URLs with embedded credentials are not allowed");
    }

    if (isLocalhost || isPrivateIP) {
      throw new Error(`Local/internal URLs are not allowed`);
    }

    return parsed.toString();
  } catch (err) {
    throw new Error(`Invalid URL: ${err.message}`);
  }
}

/**
 * Resolve host to IP and ensure all resolved addresses are public.
 * Protects against DNS-based SSRF where hostname resolves to private IPs.
 * @param {string} url - URL to validate via DNS resolution
 */
async function assertExternalUrlResolvesPublicly(url) {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // IP literals are already checked by validateNestedUrl
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error("Resolved address is local/internal");
    }
    return;
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records || records.length === 0) {
    throw new Error("Hostname did not resolve to any address");
  }

  for (const record of records) {
    if (!record || !record.address) continue;
    if (isBlockedIp(record.address)) {
      throw new Error("Resolved address is local/internal");
    }
  }
}

module.exports = {
  validateArticleUrl,
  validateNestedUrl,
  assertExternalUrlResolvesPublicly,
};
