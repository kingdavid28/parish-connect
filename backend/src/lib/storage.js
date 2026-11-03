const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const config = require("../config");
const { uuid } = require("./helpers");

const PUBLIC_URL_CHECK_TIMEOUT_MS = 5000;

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

let s3 = null;
function getClient() {
  if (
    !config.r2.accountId ||
    !config.r2.accessKeyId ||
    !config.r2.secretAccessKey ||
    !config.r2.bucket
  ) {
    return null;
  }
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    });
  }
  return s3;
}

function getPublicBaseUrl() {
  try {
    const url = new URL(config.r2.publicUrl);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /todo|xxxx/i.test(url.hostname)
    ) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function verifyPublicUrl(url) {
  const options = {
    signal: AbortSignal.timeout(PUBLIC_URL_CHECK_TIMEOUT_MS),
    redirect: "error",
  };
  const response = await fetch(url, { ...options, method: "HEAD" });
  if (response.status === 405 || response.status === 501) {
    const getResponse = await fetch(url, {
      ...options,
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });
    try {
      if (!getResponse.ok) throw new Error(`Public image check returned HTTP ${getResponse.status}`);
    } finally {
      await getResponse.body?.cancel();
    }
    return;
  }
  if (!response.ok) throw new Error(`Public image check returned HTTP ${response.status}`);
}

/** Detect real image type from magic bytes (multer memory buffers). */
function sniffImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  )
    return "image/webp";
  return null;
}

/**
 * Validate + store an uploaded image in R2.
 * @param {Express.Multer.File} file
 * @param {string} folder e.g. "avatars", "posts", "messages", "receipts", "groups"
 * @param {number} maxBytes
 * @returns {Promise<{url?: string, error?: string}>}
 */
async function storeImage(file, folder, maxBytes) {
  if (!file) return {};
  if (file.size > maxBytes) {
    return { error: `Image too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB.` };
  }
  const mimeType = sniffImageType(file.buffer);
  if (!mimeType || !ALLOWED_TYPES[mimeType]) {
    return { error: "Invalid image type. Allowed: JPG, PNG, GIF, WebP" };
  }
  const publicBaseUrl = getPublicBaseUrl();
  if (!publicBaseUrl) {
    return { error: "Public file storage URL is invalid. Check the R2_PUBLIC_URL setting." };
  }
  const client = getClient();
  if (!client) {
    return { error: "File storage is not configured" };
  }
  const key = `${folder}/${uuid()}.${ALLOWED_TYPES[mimeType]}`;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: mimeType,
      })
    );
    const url = `${publicBaseUrl}/${key}`;
    try {
      await verifyPublicUrl(url);
    } catch (err) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: key }));
      } catch (cleanupError) {
        console.error("R2 cleanup failed for an inaccessible upload:", cleanupError.message);
      }
      console.error("R2 public image check failed:", err.message);
      return {
        error:
          "Image storage is unavailable. Check that R2_PUBLIC_URL is correct and the bucket's public URL is enabled.",
      };
    }
    return { url };
  } catch (err) {
    console.error("R2 upload error:", err.message);
    return { error: "Failed to save image" };
  }
}

module.exports = { storeImage };
