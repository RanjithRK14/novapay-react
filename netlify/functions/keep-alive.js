/**
 * keep-alive.js — Netlify Scheduled Function
 * Keeps gateway AND user-service alive to prevent Cloudflare 429 on wake.
 * CommonJS required for Netlify scheduled functions.
 */
const URLS = [
  "https://novapay-api-gateway.onrender.com/health",
  "https://novapay-api-gateway.onrender.com/ping/user",
];
const handler = async function (event, context) {
  console.log(`[keep-alive] ${new Date().toISOString()}`);
  URLS.forEach(url => {
    fetch(url, { method: "GET" })
      .then(r => console.log(`[keep-alive] ✓ ${url} → ${r.status}`))
      .catch(e => console.log(`[keep-alive] ✗ ${url} → ${e.message}`));
  });
  return { statusCode: 200, body: "pings sent" };
};
module.exports = { handler };
