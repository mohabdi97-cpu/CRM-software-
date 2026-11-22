import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addSignal, createWorkspace, duplicateCandidates, exportCsv, extractSignals, importRaw,
  normalizeRow, parseImport, promoteRaw, removeContact, updateRaw, upsertContact,
  validateContact, verifySignal,
} from "../public/domain.js";

test("CSV preserves quotes, line breaks, duplicate headers, and extra fields", () => {
  const [record] = parseImport(
    '\uFEFFName,Notes,Notes,\r\n" Ada Rao ","Line one\nLine ""two""",backup,,extra\r\n',
    "leads.csv",
  );
  assert.deepEqual(record, {
    Name: " Ada Rao ",
    Notes: 'Line one\nLine "two"',
    "Notes (2)": "backup",
    "Unlabelled column 4": "",
    "Unlabelled column 5": "extra",
  });
});

test("TSV, semicolon-delimited CSV, and JSON envelopes import original columns", () => {
  assert.deepEqual(parseImport('Name\t"Work email"\nAda\tada@example.com', "lead.tsv"), [
    { Name: "Ada", "Work email": "ada@example.com" },
  ]);
  assert.deepEqual(parseImport('Name;Note\nAda;"Hello, there"', "lead.csv"), [
    { Name: "Ada", Note: "Hello, there" },
  ]);
  const [record] = parseImport(
    '{"rows":[{"__proto__":{"tag":"preserved"},"Name":"Ada","Tracking":{"score":3},"tags":["inbound"]}]}',
    "lead.json",
  );
  assert.equal(Object.hasOwn(record, "__proto__"), true);
  assert.deepEqual(record.Tracking, { score: 3 });
  assert.deepEqual(record.tags, ["inbound"]);
  assert.throws(() => parseImport("Name,Email\nAda,\"unterminated", "bad.csv"), /left open/);
  assert.throws(() => parseImport('["Ada"]', "bad.json"), /objects/);
  assert.throws(() => parseImport("Name,Email\n", "no-records.csv"), /no records/);
});

test("normalisation supports aliases and explicit mappings while keeping raw data intact", () => {
  let state = createWorkspace();
  state.settings.aliases.industry = ["Market"];
  const raw = {
    "Given name": "  Ada ",
    "Family name": " Rao  ",
    "Record email": "ADA@EXAMPLE.COM",
    "Work email": "alternate@example.com",
    "Telephone": "+44 (0)20 7946 0123 ext. 42",
    "Company": " Beacon  Works ",
    "Market": " Manufacturing ",
    "Additional": { tag: "Keep original" },
  };
  state = importRaw(state, [raw], { mapping: { email: "Record email" }, source: "Trade show" });

  assert.deepEqual(state.raw[0].data, raw);
  assert.notEqual(state.raw[0].data, raw);
  assert.deepEqual(state.raw[0].contact, {
    fullName: "Ada Rao",
    email: "ada@example.com",
    phone: "+442079460123 x42",
    businessName: "Beacon Works",
    industry: "Manufacturing",
    buyingSignals: [],
    custom: {},
  });
  assert.equal(normalizeRow(raw, { mapping: { email: "" } }).email, "");
  assert.equal(normalizeRow({ contact: { email: "nested@example.com" } }, {
    mapping: { email: "contact.email" },
  }).email, "nested@example.com");
});

test("extracts provenance from supplied evidence and leaves imported claims unverified", () => {
  const signals = extractSignals({
    notes: "The company is hiring six engineers.\nNo expansion planned.",
    "Buying signal": [{ type: "Expansion", evidence: "New depot announced.", verified: true, id: "untrusted-id" }],
    "Evidence URL": "https://example.com/company/news",
    "Published date": "2026-11-05",
  }, { source: "Company research" });
  assert.deepEqual(signals.map((signal) => signal.type), ["Expansion", "Hiring"]);
  for (const signal of signals) {
    assert.equal(signal.source, "Company research");
    assert.equal(signal.url, "https://example.com/company/news");
    assert.equal(signal.date, "2026-11-05");
    assert.equal(signal.verified, false);
    assert.notEqual(signal.id, "untrusted-id");
  }
  assert.equal(extractSignals({ notes: "No hiring planned. We're not looking for a new vendor." }).length, 0);
  const [direct] = extractSignals({ "Signal type": "Expansion", "Source URL": "https://example.com/locations" });
  assert.equal(direct.type, "Expansion");
  assert.equal(extractSignals({ "Signal evidence": "Something happened", "Signal URL": "javascript:void(0)" })[0].url, "");
});

test("duplicate review is explicit and merge keeps populated contact fields and evidence", () => {
  let state = createWorkspace();
  state = upsertContact(state, {
    fullName: "Ada Rao", email: "ada@example.com", businessName: "Beacon Works", industry: "Retail",
  });
  const contactId = state.contacts[0].id;
  state = addSignal(state, contactId, { type: "Hiring", evidence: "Opened two sales roles.", verified: true });
  const [existingSignal] = state.contacts[0].buyingSignals;
  state = importRaw(state, [{
    Name: "Ada R.", Email: "ADA@EXAMPLE.COM", Company: "Alternate spelling",
    Sector: "Software", Mobile: "+442079460123", Notes: "Announced an expansion into Europe.",
  }], { source: "Commerce report" });
  const [raw] = state.raw;
  assert.deepEqual(duplicateCandidates(state, raw.contact).map((entry) => entry.id), [contactId]);
  assert.throws(() => promoteRaw(state, raw.id), { code: "DUPLICATE" });

  const separate = promoteRaw(state, raw.id, { allowDuplicate: true });
  assert.equal(separate.contacts.length, 2);
  assert.notEqual(separate.raw[0].contactId, contactId);
  assert.equal(state.raw[0].status, "pending");

  const merged = promoteRaw(state, raw.id, { mergeWith: contactId });
  assert.equal(merged.contacts.length, 1);
  assert.equal(merged.contacts[0].fullName, "Ada Rao");
  assert.equal(merged.contacts[0].industry, "Retail");
  assert.equal(merged.contacts[0].phone, "+442079460123");
  assert.deepEqual(merged.contacts[0].buyingSignals.map((signal) => signal.type), ["Hiring", "Expansion"]);
  assert.equal(merged.contacts[0].buyingSignals[0].id, existingSignal.id);
  assert.equal(merged.raw[0].data, raw.data);
  assert.equal(merged.raw[0].status, "promoted");
  assert.equal(merged.raw[0].contactId, contactId);
  assert.equal(promoteRaw(merged, raw.id), merged);
});

test("review drafts may be fixed or dismissed and unlink on contact removal", () => {
  let state = importRaw(createWorkspace(), [{ Name: "Ada", Email: "broken", Phone: "invalid phone" }]);
  const rawId = state.raw[0].id;
  assert.deepEqual(Object.keys(validateContact(state.raw[0].contact)), ["email", "phone"]);
  assert.throws(() => promoteRaw(state, rawId), { code: "VALIDATION" });
  state = updateRaw(state, rawId, { status: "dismissed" });
  assert.throws(() => promoteRaw(state, rawId), /Restore/);
  state = updateRaw(state, rawId, { status: "pending", contact: { email: "ada@example.com", phone: "020 7946 0123" } });
  state = promoteRaw(state, rawId);
  assert.equal(state.raw[0].data.Email, "broken");
  assert.equal(state.contacts[0].email, "ada@example.com");
  const removed = removeContact(state, state.contacts[0].id);
  assert.equal(removed.contacts.length, 0);
  assert.equal(removed.raw[0].status, "pending");
  assert.equal(removed.raw[0].contactId, null);
  assert.equal(removed.raw[0].contact.email, "ada@example.com");
});

test("manual signals can be verified or removed from verification and require evidence", () => {
  let state = upsertContact(createWorkspace(), { fullName: "Ada Rao" });
  const contactId = state.contacts[0].id;
  assert.throws(() => addSignal(state, contactId, { type: "Hiring" }), /evidence/);
  assert.throws(() => addSignal(state, contactId, { evidence: "Hiring", url: "javascript:void(0)" }), /valid HTTP/);
  assert.throws(() => addSignal(state, contactId, { evidence: "Hiring", date: "2026-02-30" }), /valid observation/);
  state = addSignal(state, contactId, { evidence: "Hiring several engineers", date: "2026-11-20" });
  const [signal] = state.contacts[0].buyingSignals;
  assert.equal(signal.verified, false);
  state = verifySignal(state, contactId, signal.id);
  assert.equal(state.contacts[0].buyingSignals[0].verified, true);
  state = verifySignal(state, contactId, signal.id, false);
  assert.equal(state.contacts[0].buyingSignals[0].verified, false);
});

test("CSV export protects formula cells and publishes the six sales columns only", () => {
  let state = upsertContact(createWorkspace(), {
    fullName: "=2+2", email: "ada@example.com", phone: "+442079460123", businessName: "Beacon", industry: "Sales",
    custom: { privateData: "Never export in clean CSV" },
  });
  state = importRaw(state, [{ "@dangerous header": "=HYPERLINK()", Notes: "Safe", "Review status": "Inbound" }]);

  assert.deepEqual(Object.keys(parseImport(exportCsv(state), "clean.csv")[0]), [
    "Full name", "Email", "Phone", "Business name", "Industry", "Buying signals",
  ]);
  const [clean] = parseImport(exportCsv(state), "clean.csv");
  assert.equal(clean["Full name"], "'=2+2");
  assert.equal(clean.Phone, "'+442079460123");
  assert.equal(normalizeRow(clean).phone, "+442079460123");
  assert.equal(exportCsv(state).includes("privateData"), false);
  const [raw] = parseImport(exportCsv(state, "raw"), "raw.csv");
  assert.equal(raw["'@dangerous header"], "'=HYPERLINK()");
  assert.equal(raw["Review status"], "Inbound");
  assert.equal(raw["Review status (Relay)"], "pending");
});

test("demo has varied synthetic contact and raw records", () => {
  const state = createWorkspace({ demo: true });
  assert.equal(state.contacts.length, 12);
  assert.equal(state.raw.length, 8);
  assert.ok(state.contacts.every((entry) => entry.email.endsWith(".example")));
  assert.ok(state.contacts.every((entry) => !Object.keys(validateContact(entry)).length));
  assert.ok(state.raw.some((entry) => duplicateCandidates(state, entry.contact).length));
});
