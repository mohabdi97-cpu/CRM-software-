export const FIELDS = [
  { key: "fullName", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "businessName", label: "Business name" },
  { key: "industry", label: "Industry" },
];

export const DEFAULT_ALIASES = {
  fullName: ["Full name", "Name", "Contact name", "Contact", "Lead name", "Prospect"],
  firstName: ["First name", "Given name", "Forename", "First"],
  lastName: ["Last name", "Surname", "Family name", "Last"],
  email: ["Email", "Email address", "Work email", "Business email", "Contact email", "E-mail"],
  phone: ["Phone", "Phone number", "Telephone", "Telephone number", "Mobile", "Mobile number", "Number", "Work phone"],
  businessName: ["Business name", "Company name", "Company", "Business", "Organisation", "Organization", "Account name", "Employer"],
  industry: ["Industry", "Sector", "Vertical", "Business sector", "Company industry"],
  buyingSignals: ["Buying signals", "Buying signal", "Signals", "Signal", "Buying intent", "Trigger event"],
  signalType: ["Signal type", "Buying signal type", "Event type"],
  signalEvidence: ["Signal evidence", "Evidence", "Signal notes", "Evidence text", "Signal description"],
  signalUrl: ["Signal URL", "Evidence URL", "Source URL", "Article URL", "News URL"],
  signalDate: ["Signal date", "Event date", "Source date", "Published date", "Observed date"],
  signalSource: ["Signal source", "Evidence source", "Source name", "Publisher", "Source"],
};

export const SIGNAL_TYPES = [
  "Funding", "Hiring", "Expansion", "Leadership change", "Procurement",
  "Technology change", "Inbound interest", "Other",
];

const SIGNAL_RULES = [
  {
    type: "Funding",
    label: "Funding round",
    field: /^(?:funding|fundinground|fundingstage|fundingamount|fundingannouncement|investmentround|financinground)$/,
    text: /\b(?:funding|financing round|seed round|series [a-e]|raised [£$€\d]|secured investment)\b/i,
  },
  {
    type: "Hiring",
    label: "Hiring",
    field: /^(?:hiring|hiringplans|hiringsignal|hiringactivity|jobopenings|openpositions|openroles|careersjobs)$/,
    text: /\b(?:hiring|recruiting|job openings?|open roles?|headcount growth|actively seeking applicants)\b/i,
  },
  {
    type: "Expansion",
    label: "Expansion",
    field: /^(?:expansion|expansionplans|expansionannouncement|newlocations?)$/,
    text: /\b(?:expanding|expansion|new (?:office|location|warehouse|market)|opens? (?:a |an )?(?:office|location|warehouse))\b/i,
  },
  {
    type: "Leadership change",
    label: "New leadership",
    field: /^(?:leadershipchange|executiveappointment|newexecutive)$/,
    text: /\b(?:new (?:ceo|cto|cfo|coo|cio|cmo|cro|chief \w+ officer|head of)|executive appointment|appointed (?:a |an )?(?:ceo|cto|cfo|coo|cio|cmo|cro|chief \w+ officer))\b/i,
  },
  {
    type: "Procurement",
    label: "Procurement",
    field: /^(?:rfp|procurementopportunity|procurementtender|opentender|tender)$/,
    text: /\b(?:rfp|request for proposals?|invitation to tender|looking for (?:a |new )?(?:supplier|vendor)|procurement tender)\b/i,
  },
  {
    type: "Technology change",
    label: "Platform change",
    field: /^(?:technologychange|platformmigration|techmigration|softwareevaluation)$/,
    text: /\b(?:platform migration|migrating (?:to|from)|replacing (?:its |their )?(?:crm|erp|platform|software)|tech stack change|software evaluation)\b/i,
  },
  {
    type: "Inbound interest",
    label: "Inbound interest",
    field: /^(?:demorequests?|pricingrequests?|inboundinterest|contactrequests?)$/,
    text: /\b(?:(?:requested|booked|scheduled) (?:a |an )?(?:demo|discovery call)|demo request|requested pricing|asked for (?:pricing|a quote)|sales enquiry|sales inquiry|contacted sales)\b/i,
  },
];

const NEGATIVE_VALUES = /^(?:no|false|0|none|unknown|n\/?a|null|not applicable)$/i;
const NEGATED_EVENTS = /\b(?:no (?:plans? to|current|active|open|reported|recent|announced|evidence of|hiring|expansion|funding)|not (?:currently|actively|planning|hiring|expanding|looking for|seeking)|hiring freeze|cancelled|canceled|denied|unconfirmed|rumou?red)\b/i;
const NOTE_FIELD = /^(?:notes?|contactnotes?|leadnotes?|description|comments?|recentnews|news|companynews|activity|latestactivity|research|researchnotes?|trigger|events?|eventdescription)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RAW_STATUSES = new Set(["pending", "promoted", "dismissed"]);
const BAD_EMAIL = /\s/;
const EMAIL = /^[^@<>]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function id() {
  return globalThis.crypto.randomUUID();
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function valueText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldName(value) {
  return String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function cleanWhitespace(value) {
  return text(value).replace(/\s+/g, " ");
}

function readHeader(data, header) {
  if (own(data, header)) return data[header];
  return header.split(".").reduce((entry, part) => isRecord(entry) && own(entry, part) ? entry[part] : undefined, data);
}

function hasValue(value) {
  return value !== undefined && value !== null && (typeof value !== "string" || value.trim() !== "");
}

function lookup(data, field, { mapping = {}, aliases = DEFAULT_ALIASES } = {}) {
  if (own(mapping, field) && typeof mapping[field] === "string") {
    return mapping[field] ? readHeader(data, mapping[field]) : undefined;
  }
  const custom = Array.isArray(aliases[field]) ? aliases[field] : [];
  const names = [field, ...custom, ...(DEFAULT_ALIASES[field] ?? [])];
  const keys = Object.keys(data);
  for (const name of names) {
    const direct = readHeader(data, name);
    if (hasValue(direct)) return direct;
    const header = keys.find((key) => fieldName(key) === fieldName(name) && hasValue(data[key]));
    if (header !== undefined) return data[header];
  }
  return undefined;
}

function delimiterFor(textContent, filename) {
  if (/\.tsv$/i.test(filename)) return "\t";
  const counts = new Map([[",", 0], ["\t", 0], [";", 0]]);
  let quoted = false;
  let hasHeader = false;
  for (let index = 0; index < textContent.length; index += 1) {
    const char = textContent[index];
    if (char === '"') {
      if (quoted && textContent[index + 1] === '"') index += 1;
      else quoted = !quoted;
      hasHeader = true;
    } else if (!quoted) {
      if (char === "\r" || char === "\n") {
        if (hasHeader) break;
        continue;
      }
      if (counts.has(char)) counts.set(char, counts.get(char) + 1);
      if (char.trim() || counts.has(char)) hasHeader = true;
    }
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0][0];
}

function parseDelimited(input, delimiter) {
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  let rowNumber = 1;
  let explicitRow = false;

  function endField() {
    row.push(field);
    field = "";
    closedQuote = false;
  }

  function endRow() {
    endField();
    if (explicitRow || row.length > 1 || row.some((value) => value.trim())) records.push(row);
    row = [];
    explicitRow = false;
    rowNumber += 1;
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
        closedQuote = true;
      }
      continue;
    }
    if (char === delimiter) {
      endField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      endRow();
    } else if (closedQuote) {
      if (char !== " " && char !== "\t") {
        throw new Error("Unexpected text after a quoted field on row " + rowNumber + ".");
      }
    } else if (char === '"' && !field.length) {
      quoted = true;
      explicitRow = true;
    } else if (char === '"') {
      throw new Error("Unexpected quote on row " + rowNumber + ".");
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("A quoted field was left open on row " + rowNumber + ".");
  if (row.length || field || closedQuote) endRow();
  return records;
}

function toObjects(records) {
  if (!records.length) return [];
  const labels = records[0];
  const rows = records.slice(1);
  const width = rows.reduce((max, row) => Math.max(max, row.length), labels.length);
  const assigned = new Set();
  const original = new Set(labels.filter((label) => label.trim()));
  const headers = Array.from({ length: width }, (_, index) => {
    const originalLabel = labels[index];
    const base = originalLabel?.trim() ? originalLabel : "Unlabelled column " + (index + 1);
    let label = base;
    let suffix = 2;
    while (assigned.has(label) || (label !== originalLabel && original.has(label))) {
      label = base + " (" + suffix + ")";
      suffix += 1;
    }
    assigned.add(label);
    return label;
  });
  return rows.map((row) => Object.fromEntries(headers.map((name, index) => [name, row[index] ?? ""])));
}

export function parseImport(fileText, filename = "") {
  const input = String(fileText ?? "").replace(/^\uFEFF/, "");
  const trimmed = input.trimStart();
  if (!trimmed) throw new Error("The file is empty.");

  let rows;
  const delimitedFile = /\.(?:csv|tsv)$/i.test(filename);
  if (/\.json$/i.test(filename) || (!delimitedFile && (trimmed.startsWith("[") || trimmed.startsWith("{")))) {
    let json;
    try {
      json = JSON.parse(input);
    } catch {
      throw new Error("The JSON file is invalid.");
    }
    if (Array.isArray(json)) rows = json;
    else if (isRecord(json)) {
      rows = [json.rows, json.contacts, json.data, json.items].find(Array.isArray) ?? [json];
    }
    if (!rows?.every(isRecord)) throw new Error("JSON records must be objects with named fields.");
  } else {
    rows = toObjects(parseDelimited(input, delimiterFor(input, filename)));
  }

  if (!rows?.length) throw new Error("The file contains no records.");
  return rows;
}

export function normalizePhone(value) {
  const input = text(value).replace(/^'(?=\+\d)/, "");
  if (!input) return "";
  const extension = input.match(/\s*(?:ext\.?|x|#)\s*(\d{1,8})$/i);
  const number = (extension ? input.slice(0, extension.index) : input)
    .replace(/^tel:\s*/i, "")
    .replace(/^(\+|00)\s*(\d{1,3})[ .-]*\(0\)/, "$1$2")
    .trim();
  if (!/^(?:\+|00)?[\d\s().-]+$/.test(number)) return input;
  const international = number.startsWith("+") || number.startsWith("00");
  const withoutPrefix = number.startsWith("00") ? number.slice(2) : number;
  const digits = withoutPrefix.replace(/\D/g, "");
  return (international ? "+" : "") + digits + (extension ? " x" + extension[1] : "");
}

function safeUrl(value) {
  try {
    const url = new URL(text(value));
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function urlIn(value) {
  return safeUrl(text(value).match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,;:!?\])}]+$/, ""));
}

function signalDate(value) {
  const date = text(value).slice(0, 10);
  if (!ISO_DATE.test(date)) return "";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? "" : date;
}

function signalType(value, evidence) {
  const label = text(value);
  const explicit = SIGNAL_TYPES.find((type) => fieldName(type) === fieldName(label));
  return explicit ?? SIGNAL_RULES.find((rule) => rule.text.test(label + " " + evidence))?.type ?? "Other";
}

function makeSignal(value, { source = "", url = "", date = "", type = "" } = {}) {
  const item = isRecord(value) ? value : { evidence: text(value) };
  const evidence = text(item.evidence ?? item.description ?? item.notes);
  const label = cleanWhitespace(item.label ?? item.title);
  const rawType = text(item.type ?? item.category) || type;
  const category = signalType(rawType, label + " " + evidence);
  const link = safeUrl(item.url ?? item.link) || urlIn(evidence) || safeUrl(url);
  return {
    id: typeof item.id === "string" && item.id ? item.id : id(),
    type: category,
    label: label || SIGNAL_RULES.find((rule) => rule.type === category)?.label || "Buying signal",
    evidence: evidence || label,
    url: link,
    source: cleanWhitespace(item.source ?? item.publisher) || cleanWhitespace(source),
    date: signalDate(item.date ?? item.observedAt ?? item.publishedAt) || signalDate(date),
    verified: item.verified === true,
  };
}

export function createSignal(value) {
  const signal = makeSignal(value);
  if (!signal.evidence && !signal.url) throw new Error("Add evidence or a source URL for this signal.");
  if (text(value?.url) && !safeUrl(value.url)) throw new Error("Enter a valid HTTP or HTTPS source URL.");
  if (text(value?.date) && !signalDate(value.date)) throw new Error("Enter a valid observation date.");
  return signal;
}

function signalKey(signal) {
  return JSON.stringify([signal.type, signal.evidence.trim().toLowerCase(), signal.url, signal.source.toLowerCase(), signal.date]);
}

function unionSignals(...groups) {
  const byKey = new Map();
  const usedIds = new Set();
  for (const group of groups) {
    for (const entry of Array.isArray(group) ? group : []) {
      const signal = makeSignal(entry);
      if (!signal.evidence && !signal.url) continue;
      const key = signalKey(signal);
      const existing = byKey.get(key);
      if (!existing) {
        if (usedIds.has(signal.id)) signal.id = id();
        usedIds.add(signal.id);
        byKey.set(key, signal);
      } else if (signal.verified && !existing.verified) {
        byKey.set(key, { ...signal, id: existing.id });
      }
    }
  }
  return [...byKey.values()];
}

function splitEvidence(value) {
  if (Array.isArray(value)) return value.flatMap(splitEvidence);
  if (isRecord(value)) return [value];
  if (!hasValue(value) || NEGATIVE_VALUES.test(text(value))) return [];
  const content = text(value);
  if (content.startsWith("[") || content.startsWith("{")) {
    try {
      return splitEvidence(JSON.parse(content));
    } catch {
      // The field contains plain evidence.
    }
  }
  return content.split(/[\n\r]+/).map((line) => line.trim()).filter(Boolean);
}

export function extractSignals(data, options = {}) {
  const rowSource = lookup(data, "signalSource", options);
  const context = {
    source: text(rowSource) || options.source,
    url: lookup(data, "signalUrl", options) ?? safeUrl(rowSource),
    date: lookup(data, "signalDate", options),
    type: text(lookup(data, "signalType", options)),
  };
  const explicit = splitEvidence(lookup(data, "buyingSignals", options));
  const evidence = splitEvidence(lookup(data, "signalEvidence", options));
  const found = [...explicit, ...evidence].map((entry) => makeSignal(
    isRecord(entry) ? { ...entry, id: undefined, verified: false } : entry,
    context,
  ));
  if (!found.length && context.type && safeUrl(context.url)) {
    found.push(makeSignal({ url: context.url, type: context.type }, context));
  }

  for (const [field, value] of Object.entries(data)) {
    const key = fieldName(field);
    const byField = SIGNAL_RULES.find((rule) => rule.field.test(key));
    if (!NOTE_FIELD.test(key) && !byField) continue;
    for (const entry of splitEvidence(value)) {
      const detail = isRecord(entry) ? text(entry.evidence ?? entry.description ?? entry.label) : text(entry);
      if (!detail || NEGATED_EVENTS.test(detail)) continue;
      const matchingRules = byField ? [byField] : SIGNAL_RULES.filter((rule) => rule.text.test(detail));
      for (const rule of matchingRules) {
        const fullEvidence = detail === "true" || /^\d+$/.test(detail) ? field + ": " + detail : detail;
        found.push(makeSignal({
          type: rule.type,
          evidence: fullEvidence,
          url: isRecord(entry) ? entry.url : undefined,
          source: isRecord(entry) ? entry.source : undefined,
          date: isRecord(entry) ? entry.date : undefined,
        }, context));
      }
    }
  }
  return unionSignals(found);
}

export function normalizeRow(data, options = {}) {
  const fullName = lookup(data, "fullName", options);
  const firstName = lookup(data, "firstName", options);
  const lastName = lookup(data, "lastName", options);
  return {
    fullName: cleanWhitespace(fullName) || [cleanWhitespace(firstName), cleanWhitespace(lastName)].filter(Boolean).join(" "),
    email: text(lookup(data, "email", options)).replace(/^mailto:/i, "").toLowerCase(),
    phone: normalizePhone(lookup(data, "phone", options)),
    businessName: cleanWhitespace(lookup(data, "businessName", options)),
    industry: cleanWhitespace(lookup(data, "industry", options)),
    buyingSignals: extractSignals(data, options),
    custom: {},
  };
}

function cleanContact(contact) {
  return {
    fullName: cleanWhitespace(contact.fullName),
    email: text(contact.email).replace(/^mailto:/i, "").toLowerCase(),
    phone: normalizePhone(contact.phone),
    businessName: cleanWhitespace(contact.businessName),
    industry: cleanWhitespace(contact.industry),
    buyingSignals: unionSignals(contact.buyingSignals),
    custom: isRecord(contact.custom) ? { ...contact.custom } : {},
  };
}

export function validateContact(contact) {
  const cleaned = cleanContact(contact);
  const errors = {};
  if (!cleaned.fullName) errors.fullName = "Full name is required.";
  if (cleaned.email && (BAD_EMAIL.test(cleaned.email) || !EMAIL.test(cleaned.email))) {
    errors.email = "Enter a valid email address.";
  }
  if (cleaned.phone && !/^\+?\d{7,15}(?: x\d{1,8})?$/.test(cleaned.phone)) {
    errors.phone = "Enter a phone number with 7 to 15 digits.";
  }
  return errors;
}

function assertContact(contact) {
  const errors = validateContact(contact);
  if (Object.keys(errors).length) {
    const error = new Error(Object.values(errors)[0]);
    error.code = "VALIDATION";
    error.fields = errors;
    throw error;
  }
}

export function importRaw(state, rows, { source = "", mapping = {} } = {}) {
  if (!Array.isArray(rows) || !rows.every(isRecord)) throw new Error("Import records must be objects.");
  const createdAt = new Date().toISOString();
  const records = rows.map((record) => {
    const data = structuredClone(record);
    return {
      id: id(),
      source: cleanWhitespace(source) || "Manual entry",
      data,
      contact: normalizeRow(data, { mapping, aliases: state.settings?.aliases, source }),
      status: "pending",
      contactId: null,
      createdAt,
      updatedAt: createdAt,
    };
  });
  return { ...state, raw: [...records, ...state.raw] };
}

export function updateRaw(state, rawId, { contact, status } = {}) {
  const record = state.raw.find((raw) => raw.id === rawId);
  if (!record) throw new Error("This raw record could not be found.");
  if (status !== undefined && (!RAW_STATUSES.has(status) || status === "promoted")) {
    throw new Error("Choose pending or dismissed, or promote the record to Sales CRM.");
  }
  if (record.status === "promoted") throw new Error("This raw record has already been promoted.");
  const next = {
    ...record,
    status: status ?? record.status,
    contact: contact ? cleanContact({ ...record.contact, ...contact }) : record.contact,
    updatedAt: new Date().toISOString(),
  };
  return { ...state, raw: state.raw.map((raw) => raw.id === rawId ? next : raw) };
}

export function duplicateCandidates(state, contact) {
  const input = cleanContact(contact);
  const name = fieldName(input.fullName);
  const company = fieldName(input.businessName);
  const validEmail = input.email && !BAD_EMAIL.test(input.email) && EMAIL.test(input.email);
  const validPhone = /^\+?\d{7,15}(?: x\d{1,8})?$/.test(input.phone);
  return state.contacts.filter((existing) => {
    if (existing.id === contact.id) return false;
    const match = cleanContact(existing);
    return (validEmail && input.email === match.email)
      || (validPhone && input.phone === match.phone)
      || (name && company && name === fieldName(match.fullName) && company === fieldName(match.businessName));
  });
}

export function upsertContact(state, contact) {
  const existing = state.contacts.find((record) => record.id === contact.id);
  const cleaned = cleanContact({ ...existing, ...contact });
  assertContact(cleaned);
  const updatedAt = new Date().toISOString();
  const record = {
    ...cleaned,
    id: existing?.id ?? id(),
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
  };
  return {
    ...state,
    contacts: existing
      ? state.contacts.map((entry) => entry.id === existing.id ? record : entry)
      : [record, ...state.contacts],
  };
}

export function promoteRaw(state, rawId, { contact, mergeWith, allowDuplicate = false } = {}) {
  const record = state.raw.find((raw) => raw.id === rawId);
  if (!record) throw new Error("This raw record could not be found.");
  if (record.status === "promoted") return state;
  if (record.status === "dismissed") throw new Error("Restore this record to pending before promoting it.");
  const draft = cleanContact({ ...record.contact, ...contact });
  const candidates = duplicateCandidates(state, draft);
  if (candidates.length && !mergeWith && !allowDuplicate) {
    const error = new Error("Review the possible duplicate before promoting this record.");
    error.code = "DUPLICATE";
    error.candidates = candidates;
    throw error;
  }
  const destination = mergeWith ? state.contacts.find((entry) => entry.id === mergeWith) : null;
  if (mergeWith && !destination) throw new Error("The selected merge contact could not be found.");

  const incoming = destination ? {
    ...Object.fromEntries(FIELDS.map(({ key }) => [key, destination[key] || draft[key]])),
    id: destination.id,
    buyingSignals: unionSignals(destination.buyingSignals, draft.buyingSignals),
    custom: { ...draft.custom, ...destination.custom },
  } : draft;
  const next = upsertContact(state, incoming);
  const promotedContact = destination
    ? next.contacts.find((entry) => entry.id === destination.id)
    : next.contacts[0];
  return {
    ...next,
    raw: next.raw.map((raw) => raw.id === rawId ? {
      ...raw,
      status: "promoted",
      contactId: promotedContact.id,
      contact: draft,
      updatedAt: promotedContact.updatedAt,
    } : raw),
  };
}

export function removeContact(state, contactId) {
  const updatedAt = new Date().toISOString();
  return {
    ...state,
    contacts: state.contacts.filter((contact) => contact.id !== contactId),
    raw: state.raw.map((raw) => raw.contactId === contactId ? {
      ...raw, contactId: null, status: "pending", updatedAt,
    } : raw),
  };
}

export function addSignal(state, contactId, value) {
  const contact = state.contacts.find((entry) => entry.id === contactId);
  if (!contact) throw new Error("This contact could not be found.");
  const signal = createSignal(value);
  return upsertContact(state, { ...contact, buyingSignals: unionSignals(contact.buyingSignals, [signal]) });
}

export function verifySignal(state, contactId, signalId, verified = true) {
  const contact = state.contacts.find((entry) => entry.id === contactId);
  if (!contact) throw new Error("This contact could not be found.");
  if (!contact.buyingSignals.some((signal) => signal.id === signalId)) throw new Error("This signal could not be found.");
  return upsertContact(state, {
    ...contact,
    buyingSignals: contact.buyingSignals.map((signal) => signal.id === signalId ? { ...signal, verified: Boolean(verified) } : signal),
  });
}

export function removeSignal(state, contactId, signalId) {
  const contact = state.contacts.find((entry) => entry.id === contactId);
  if (!contact) throw new Error("This contact could not be found.");
  return upsertContact(state, {
    ...contact,
    buyingSignals: contact.buyingSignals.filter((signal) => signal.id !== signalId),
  });
}

function csvCell(value) {
  const raw = valueText(value);
  const dangerous = /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(raw);
  const protectedValue = dangerous ? "'" + raw : raw;
  return '"' + protectedValue.replaceAll('"', '""') + '"';
}

export function exportCsv(state, mode = "clean") {
  if (mode === "raw") {
    const keys = [...new Set(state.raw.flatMap((record) => Object.keys(record.data)))];
    const assigned = new Set(keys);
    const metadata = ["Import source", "Review status"].map((label) => {
      let unique = label;
      while (assigned.has(unique)) unique += " (Relay)";
      assigned.add(unique);
      return unique;
    });
    return [
      [...keys, ...metadata],
      ...state.raw.map((record) => [
        ...keys.map((key) => own(record.data, key) ? record.data[key] : ""),
        record.source,
        record.status,
      ]),
    ].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
  return [
    [...FIELDS.map(({ label }) => label), "Buying signals"],
    ...state.contacts.map((contact) => [
      ...FIELDS.map(({ key }) => contact[key]),
      contact.buyingSignals.length ? JSON.stringify(contact.buyingSignals) : "",
    ]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const DEMO_CONTACTS = [
  ["Maya Chen", "maya@verdant.example", "+442079460321", "Verdant Labs", "Software", [
    ["Funding", "Funding round", "Verdant Labs announced a Series A to grow its sales and product teams.", "Company announcement", 3],
  ]],
  ["James Okafor", "james@northstar.example", "+441614960482", "Northstar Logistics", "Logistics", [
    ["Hiring", "Hiring", "Northstar posted eight operations and warehouse roles.", "Careers page", 5],
    ["Expansion", "New location", "Northstar announced a new distribution centre in Leeds.", "Company announcement", 12],
  ]],
  ["Priya Shah", "priya@forma.example", "+442079460263", "Forma Health", "Healthcare", [
    ["Inbound interest", "Requested demo", "Priya requested a demo of the sales platform.", "Demo request form", 2],
  ]],
  ["Alex Morgan", "alex@atlas.example", "+441174960321", "Atlas & Co.", "Professional services", []],
  ["Isabel Costa", "isabel@juniper.example", "+441214960145", "Juniper Studio", "Design", [
    ["Expansion", "Expansion", "Juniper shared plans to open a second studio in Birmingham.", "Company newsletter", 8],
  ]],
  ["Daniel Kim", "daniel@meridian.example", "+442079460511", "Meridian Finance", "Financial services", [
    ["Leadership change", "New leadership", "Meridian published the appointment of a new chief revenue officer.", "Company announcement", 9],
  ]],
  ["Amara Johnson", "amara@fieldwork.example", "+441314960126", "Fieldwork Energy", "Energy", []],
  ["Oliver Reed", "oliver@commonthread.example", "+441514960214", "Common Thread", "Retail", [
    ["Technology change", "Platform change", "Common Thread reported an upcoming migration to a new commerce platform.", "Company newsletter", 14],
  ]],
  ["Sofia Patel", "sofia@lumen.example", "+442079460652", "Lumen Analytics", "Software", [
    ["Hiring", "Hiring", "Lumen published five customer success vacancies.", "Careers page", 7],
  ]],
  ["Noah Williams", "noah@cedar.example", "+441174960523", "Cedar & Vale", "Construction", []],
  ["Leila Ahmed", "leila@harbour.example", "+442079460684", "Harbour Works", "Manufacturing", [
    ["Procurement", "Open tender", "Harbour Works published a request for proposals for its next procurement platform.", "Procurement notice", 4],
  ]],
  ["Ethan Brooks", "ethan@parallel.example", "+441134960247", "Parallel Education", "Education", []],
];

const DEMO_RAW = [
  ["Conference list", { "First name": "Nia", "Last name": "Bennett", "Work email": "NIA@APERTURE.EXAMPLE", "Telephone": "+44 (0)20 7946 0812", "Organisation": "Aperture Systems", "Sector": "Software", "Job title": "VP Sales", "Booth": "C14", "Notes": "Asked for pricing after the conference." }],
  ["Company research", { "Name": "Maya Chen", "Email": "maya@verdant.example", "Company": "Verdant Labs", "Industry": "Software", "LinkedIn": "https://verdant.example/team", "Notes": "Verdant is hiring two account executives.", "Source URL": "https://verdant.example/careers" }],
  ["Inbound form", { "Contact": "Hugo Martin", "Email address": "hugo@brightmill.example", "Company name": "Brightmill", "Mobile": "07700 900315", "Industry": "Manufacturing", "Product interest": "CRM", "Buying signal": "Requested a demo for the sales team." }],
  ["Company research", { "Contact name": "Rosa Evans", "Organisation": "Kite Fleet", "Company industry": "Logistics", "Role": "Head of Partnerships", "Notes": "Announced a new warehouse in Manchester.", "Source URL": "https://kitefleet.example/news" }],
  ["Partner referral", { "Prospect": "Frances Ward", "Business email": "frances@moorbend.example", "Work phone": "0117 496 0415", "Business": "Moor Bend", "Vertical": "Retail", "Referral note": "Partner introduction", "Owner": "Partnerships" }],
  ["Old contact export", { "Lead name": "Alex Morgan", "Email": "alex@atlas.example", "Company": "Atlas & Co.", "Number": "0117-496-0321", "Account reference": "A-1442", "Duplicate reason": "Existing sales contact" }],
  ["Industry directory", { "Name": "Tariq Ali", "Email": "tariq@oakline", "Company": "Oakline Surveying", "Industry": "Construction", "Region": "South West", "Notes": "Check contact details before outreach." }],
  ["Company research", { "Full name": "Marta Lewis", "Email": "marta@equinox.example", "Business name": "Equinox Dental", "Industry": "Healthcare", "Signal type": "Leadership change", "Signal evidence": "Equinox named a new chief operating officer.", "Signal URL": "https://equinox.example/news/leadership" }],
];

function demoWorkspace(state) {
  const dateBeforeToday = (days) => new Date(Date.now() - days * 86_400_000).toISOString();
  const contacts = DEMO_CONTACTS.map(([fullName, email, phone, businessName, industry, signals], index) => {
    const contactId = "demo-contact-" + (index + 1);
    return {
      id: contactId,
      fullName, email, phone, businessName, industry,
      buyingSignals: signals.map(([type, label, evidence, source, age], signalIndex) => ({
        id: contactId + "-signal-" + (signalIndex + 1),
        type, label, evidence, source,
        date: dateBeforeToday(age).slice(0, 10),
        url: type === "Inbound interest" ? "" : "https://" + email.split("@")[1] + "/news",
        verified: true,
      })),
      custom: {},
      createdAt: dateBeforeToday(30 - index),
      updatedAt: dateBeforeToday(index + 1),
    };
  });
  const raw = DEMO_RAW.flatMap(([source, data], index) => {
    const [record] = importRaw(state, [data], { source }).raw;
    const createdAt = dateBeforeToday(index + 1);
    return { ...record, id: "demo-raw-" + (index + 1), createdAt, updatedAt: createdAt };
  });
  return { ...state, contacts, raw };
}

export function createWorkspace({ demo = false } = {}) {
  const state = {
    version: 1,
    contacts: [],
    raw: [],
    views: [],
    settings: {
      aliases: structuredClone(DEFAULT_ALIASES),
      customFields: [],
    },
  };
  return demo ? demoWorkspace(state) : state;
}
