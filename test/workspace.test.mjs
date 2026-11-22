import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import workspace from "../api/workspace.js";
import { createWorkspace, importRaw, upsertContact } from "../public/domain.js";

const host = "crm.test";
const origin = `https://${host}`;

async function request(method, { cookie, body, headers = {}, parsed = false } = {}) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Object.assign(Readable.from(payload), {
    method,
    headers: {
      host,
      ...(cookie && { cookie }),
      ...(payload.length && { "content-type": "application/json", "content-length": payload[0].length }),
      ...headers,
    },
    ...(parsed && { body }),
  });
  const responseHeaders = new Map();
  let responseBody;
  const res = {
    setHeader(name, value) { responseHeaders.set(name.toLowerCase(), value); },
    end(serialized) { responseBody = JSON.parse(serialized); },
  };
  await workspace(req, res);
  assert.equal(responseHeaders.get("cache-control"), "private, no-store");
  assert.match(responseHeaders.get("content-type"), /^application\/json\b/);
  return { status: res.statusCode, headers: responseHeaders, body: responseBody };
}

test("private workspace authenticates requests and rejects a stale write without losing data", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "relay-workspace-test-"));
  const path = join(directory, "workspace.json");
  t.after(() => rm(directory, { recursive: true, force: true }));

  const key = "test-only access key";
  const environment = {
    BLOB_READ_WRITE_TOKEN: undefined,
    BLOB_STORE_ID: undefined,
    VERCEL: undefined,
    CRM_LOCAL_DATA_PATH: path,
    CRM_ACCESS_KEY_HASH: createHash("sha256").update(key).digest("hex"),
    CRM_SESSION_SECRET: "test-only session secret with more than 32 characters",
  };
  for (const [name, value] of Object.entries(environment)) {
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  const publicStatus = { available: true, signedIn: false };
  const publicGet = await request("GET");
  assert.equal(publicGet.status, 200);
  assert.deepEqual(publicGet.body, publicStatus);

  const rejectedLogin = await request("POST", { body: { key: "incorrect" }, headers: { origin } });
  assert.equal(rejectedLogin.status, 401);
  assert.equal(rejectedLogin.headers.has("set-cookie"), false);

  const state = importRaw(upsertContact(createWorkspace(), {
    fullName: "Ada Rao", email: "ada@example.test", businessName: "Beacon Works", industry: "Manufacturing",
  }), [{ Name: "New prospect", Notes: "Private intake notes" }], { source: "Test import" });
  const firstWrite = { state, revision: null };
  assert.equal((await request("PUT", { body: firstWrite, headers: { origin } })).status, 401);
  await assert.rejects(readFile(path), { code: "ENOENT" });

  const login = await request("POST", { body: { key }, headers: { origin }, parsed: true });
  assert.equal(login.status, 200);
  assert.equal(login.body.available, true);
  assert.equal(login.body.signedIn, true);
  assert.equal(login.body.revision, null);
  assert.deepEqual(login.body.state, createWorkspace());
  const session = login.headers.get("set-cookie");
  assert.match(session, /^relay_session=[^;]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000$/);
  const [cookie] = session.split(";");

  const blockedOrigin = await request("PUT", {
    cookie, body: firstWrite, headers: { origin: "https://unrelated.test" },
  });
  assert.equal(blockedOrigin.status, 403);
  await assert.rejects(readFile(path), { code: "ENOENT" });

  const saved = await request("PUT", { cookie, body: firstWrite, headers: { origin } });
  assert.equal(saved.status, 200);
  const { revision } = saved.body;
  assert.match(revision, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), state);

  const stale = await request("PUT", {
    cookie, body: { state: createWorkspace(), revision: null }, headers: { origin },
  });
  assert.equal(stale.status, 409);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), state);

  const privateGet = await request("GET", { cookie });
  assert.equal(privateGet.status, 200);
  assert.deepEqual(privateGet.body, { available: true, signedIn: true, state, revision });
  assert.deepEqual((await request("GET")).body, publicStatus);
  assert.deepEqual((await request("GET", { cookie: `${cookie}A` })).body, publicStatus);

  const logout = await request("DELETE", { cookie, headers: { origin } });
  assert.equal(logout.status, 200);
  assert.deepEqual(logout.body, { signedIn: false });
  assert.match(logout.headers.get("set-cookie"), /^relay_session=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0$/);
});
