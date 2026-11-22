import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { storage, storageConfigured, WriteConflict } from "../server/storage.js";

const cookieName = "relay_session";
const lifetime = 60 * 60 * 24 * 30;
const bodyLimit = 3_750_000;
const sha256 = (value) => createHash("sha256").update(value).digest();
const signature = (value) => createHmac("sha256", process.env.CRM_SESSION_SECRET)
  .update(process.env.CRM_ACCESS_KEY_HASH + "." + value)
  .digest("base64url");

function signedIn(req) {
  const cookie = req.headers.cookie?.split(/;\s*/).find((part) => part.startsWith(cookieName + "="));
  const [expires, salt, signed, extra] = cookie?.slice(cookieName.length + 1).split(".") ?? [];
  if (extra || !/^\d{10,12}$/.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000) ||
      !/^[A-Za-z0-9_-]{22}$/.test(salt) || !/^[A-Za-z0-9_-]{43}$/.test(signed)) return false;
  return timingSafeEqual(Buffer.from(signed), Buffer.from(signature(expires + "." + salt)));
}

function setSession(res, current) {
  const payload = Math.floor(Date.now() / 1000 + lifetime) + "." + randomBytes(16).toString("base64url");
  const isSecure = process.env.VERCEL === "1";
  const value = current ? payload + "." + signature(payload) : "";
  res.setHeader("Set-Cookie", cookieName + "=" + value + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
    (current ? lifetime : 0) + (isSecure ? "; Secure" : ""));
}

function respond(res, status, payload) {
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function originValid(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    return origin.host === req.headers.host && (origin.protocol === "https:" || process.env.VERCEL !== "1");
  } catch {
    return false;
  }
}

async function bodyOf(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new Error("JSON is required.");
  if (Number(req.headers["content-length"]) > bodyLimit) throw new Error("The workspace exceeds the storage limit.");
  if (req.body !== undefined) {
    const data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (Buffer.byteLength(JSON.stringify(data)) > bodyLimit) throw new Error("The workspace exceeds the storage limit.");
    return data;
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > bodyLimit) throw new Error("The workspace exceeds the storage limit.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function stateValid(state) {
  return state?.version === 1 && Array.isArray(state.contacts) && Array.isArray(state.raw) &&
    Array.isArray(state.views) && state.settings && typeof state.settings === "object" &&
    !Array.isArray(state.settings) && state.contacts.every((row) => typeof row?.id === "string") &&
    state.raw.every((row) => typeof row?.id === "string");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return respond(res, 405, { error: "Method not allowed." });
  }

  const hash = process.env.CRM_ACCESS_KEY_HASH;
  const available = /^[a-f\d]{64}$/i.test(hash) &&
    (process.env.CRM_SESSION_SECRET?.length ?? 0) >= 32 && storageConfigured();
  try {
    if (req.method === "GET") {
      if (!available || !signedIn(req)) return respond(res, 200, { available, signedIn: false });
      const snapshot = await (await storage()).read();
      return respond(res, 200, { available, signedIn: true, ...snapshot });
    }

    if (!originValid(req)) return respond(res, 403, { error: "Request origin is invalid." });
    if (!available) return respond(res, 503, { error: "Private workspace access is unavailable." });
    if (req.method === "DELETE") {
      setSession(res, false);
      return respond(res, 200, { signedIn: false });
    }

    if (req.method === "PUT" && !signedIn(req)) return respond(res, 401, { error: "Sign in to save your workspace." });
    let body;
    try {
      body = await bodyOf(req);
    } catch {
      return respond(res, 400, { error: "Send a valid JSON workspace smaller than 3.75 MB." });
    }

    if (req.method === "POST") {
      const key = body?.key;
      if (typeof key !== "string" || key.length > 128 || !timingSafeEqual(sha256(key), Buffer.from(hash, "hex"))) {
        return respond(res, 401, { error: "That access key is invalid." });
      }
      const snapshot = await (await storage()).read();
      setSession(res, true);
      return respond(res, 200, { available, signedIn: true, ...snapshot });
    }

    if (!stateValid(body?.state) || (body.revision !== null &&
      (typeof body.revision !== "string" || body.revision.length > 128))) {
      return respond(res, 400, { error: "The workspace data is invalid." });
    }

    const revision = await (await storage()).write(body.state, body.revision);
    return respond(res, 200, { revision });
  } catch (error) {
    if (error instanceof WriteConflict) {
      return respond(res, 409, { error: "This workspace changed in another tab. Reload the page before trying again." });
    }
    console.error("Relay workspace operation failed", error.name, error.code ?? "");
    return respond(res, 503, { error: "Storage is temporarily unavailable. Try again shortly." });
  }
}
