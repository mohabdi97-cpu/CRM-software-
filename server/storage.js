import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createWorkspace } from "../public/domain.js";

const blobPath = "relay/workspace-v1.json";
const empty = () => ({ state: createWorkspace(), revision: null });

export class WriteConflict extends Error {}

async function openBlob() {
  const { get, put, BlobPreconditionFailedError } = await import("@vercel/blob");

  async function read() {
    const blob = await get(blobPath, { access: "private", useCache: false });
    if (!blob) return empty();
    if (!blob.stream || !blob.blob.etag) throw new Error("Storage returned incomplete workspace data.");
    // Blob reads can mark the same quoted object version as weak. Conditional writes require the strong form.
    const revision = blob.blob.etag.replace(/^W\//, "");
    return { state: await new Response(blob.stream).json(), revision };
  }

  async function write(state, revision) {
    try {
      const blob = await put(blobPath, JSON.stringify(state), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        ...(revision ? { allowOverwrite: true, ifMatch: revision } : {}),
      });
      return blob.etag;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError ||
          (!revision && /already exists|allowOverwrite/i.test(error.message))) {
        throw new WriteConflict();
      }
      throw error;
    }
  }

  return { read, write };
}

function openLocal(path) {
  const file = resolve(path);
  let pending = Promise.resolve();
  const digest = (data) => createHash("sha256").update(data).digest("hex");

  async function read() {
    try {
      const content = await readFile(file, "utf8");
      return { state: JSON.parse(content), revision: digest(content) };
    } catch (error) {
      if (error.code === "ENOENT") return empty();
      throw error;
    }
  }

  function write(state, revision) {
    const operation = pending.then(async () => {
      if ((await read()).revision !== revision) throw new WriteConflict();
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const temp = file + "." + randomUUID();
      const content = JSON.stringify(state);
      try {
        await writeFile(temp, content, { mode: 0o600, flag: "wx" });
        if (revision) await rename(temp, file);
        else await link(temp, file);
      } catch (error) {
        if (error.code === "EEXIST") throw new WriteConflict();
        throw error;
      } finally {
        await rm(temp, { force: true });
      }
      return digest(content);
    });
    pending = operation.catch(() => {});
    return operation;
  }

  return { read, write };
}

let local;

export function storageConfigured() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL !== "1" && process.env.CRM_LOCAL_DATA_PATH));
}

export function storage() {
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return openBlob();
  const path = process.env.CRM_LOCAL_DATA_PATH;
  if (process.env.VERCEL !== "1" && path) {
    if (local?.path !== path) local = { path, storage: openLocal(path) };
    return local.storage;
  }
  throw new Error("Private storage is not configured.");
}
