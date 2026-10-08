const webpush = require("web-push");
const pool = require("../db/pool");
const config = require("../config");

let vapidReady = false;
function ensureVapid() {
  if (!config.vapid.publicKey || !config.vapid.privateKey) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(config.vapid.email, config.vapid.publicKey, config.vapid.privateKey);
    vapidReady = true;
  }
  return true;
}

/**
 * Send a push notification to all of a user's subscriptions.
 * Best-effort — never throws.
 */
async function sendPushToUser(userId, payload) {
  if (!ensureVapid()) return;
  try {
    const { rows: subs } = await pool.query(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
      [userId]
    );
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
          );
        } catch (err) {
          // 404/410 = subscription expired — remove it
          if (err.statusCode === 404 || err.statusCode === 410) {
            await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [sub.endpoint]);
          } else {
            console.error("Push send error:", err.message);
          }
        }
      })
    );
  } catch (err) {
    console.error("sendPushToUser error:", err.message);
  }
}

module.exports = { sendPushToUser };
