const webpush = require("web-push");
const pool = require("../db/pool");
const config = require("../config");
const { uuid } = require("./helpers");

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
function safeNotificationUrl(rawUrl) {
  try {
    const appUrl = new URL(config.appUrl);
    const url = new URL(String(rawUrl || config.appBasePath || "/"), appUrl);
    if (url.origin !== appUrl.origin) return "/";
    const basePath = String(config.appBasePath || "").replace(/\/+$/, "");
    const pathname = basePath && (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`))
      ? url.pathname.slice(basePath.length) || "/"
      : url.pathname;
    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

async function createInAppNotification(userId, payload, client = pool) {
  const title = String(payload?.title || "").trim().slice(0, 180);
  if (!userId || !title) throw new Error("Notification recipient and title are required");
  const result = await client.query(
    `INSERT INTO app_notifications (id, user_id, category, title, body, url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, category, title, body, url, read_at, created_at`,
    [
      uuid(),
      userId,
      String(payload.category || "activity").trim().slice(0, 50) || "activity",
      title,
      String(payload.body || "").trim().slice(0, 500),
      safeNotificationUrl(payload.url),
    ]
  );
  return result.rows[0];
}

async function sendWebPushToUser(userId, payload) {
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

async function sendPushToUser(userId, payload) {
  try {
    await createInAppNotification(userId, payload);
  } catch (err) {
    console.error("createInAppNotification error:", err.message);
  }
  await sendWebPushToUser(userId, payload);
}

module.exports = { createInAppNotification, sendPushToUser, sendWebPushToUser };
