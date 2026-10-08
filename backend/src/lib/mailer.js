const nodemailer = require("nodemailer");
const config = require("../config");

let transporter = null;

function getTransporter() {
  if (!config.mail.host || !config.mail.username) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465,
      auth: { user: config.mail.username, pass: config.mail.password },
    });
  }
  return transporter;
}

/**
 * Send an email via SMTP. Best-effort — returns false on failure.
 * @param {string} to   recipient email
 * @param {string} subject
 * @param {string} html HTML body
 * @param {string} [toName]
 */
async function sendEmail(to, subject, html, toName) {
  const t = getTransporter();
  if (!t) {
    console.error("sendEmail: SMTP not configured");
    return false;
  }
  try {
    await t.sendMail({
      from: `"${config.mail.fromName}" <${config.mail.fromAddress}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ""),
    });
    return true;
  } catch (err) {
    console.error("sendEmail error:", err.message);
    return false;
  }
}

module.exports = { sendEmail };
