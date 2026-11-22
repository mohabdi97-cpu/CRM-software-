import {
  FIELDS, DEFAULT_ALIASES, SIGNAL_TYPES, createWorkspace, importRaw, updateRaw,
  upsertContact, removeContact, duplicateCandidates, promoteRaw, addSignal,
  verifySignal, removeSignal, exportCsv,
} from "./domain.js";
import { closeDialog, escapeHtml as h, icon, openDialog, renderWorkspace, toast } from "./ui.js";
import { openImport } from "./import.js";

const $ = (id) => document.getElementById(id);
const search = $("search");
const demoKey = "relay-crm-demo-v1";
const cleanViews = [{ id: "all", name: "All contacts" }, { id: "signals", name: "With signals", signal: "any" }];
const rawViews = [{ id: "all", name: "All records" }, { id: "pending", name: "Needs review", status: "pending" }, { id: "promoted", name: "Promoted", status: "promoted" }];
const matchText = (value) => String(value ?? "").toLocaleLowerCase();
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const dataMode = $("data-mode");
let state = demoState();
let space = "clean";
let activeId = "all";
let filters = {};
let sort = { field: "", direction: "asc" };
let available = false;
let signedIn = false;
let revision = null;
let busy = false;

function demoState() {
  try {
    const saved = JSON.parse(localStorage.getItem(demoKey));
    if (saved?.version === 1 && Array.isArray(saved.contacts) && Array.isArray(saved.raw)) return saved;
  } catch {
    // Start with sample data when browser storage is unavailable.
  }
  return createWorkspace({ demo: true });
}

async function request(method = "GET", body) {
  const options = { method, credentials: "same-origin", cache: "no-store" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch("/api/workspace", options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The workspace service is unavailable.");
  return data;
}

async function commit(next) {
  if (busy) throw new Error("A save is already in progress.");
  busy = true;
  try {
    if (signedIn) {
      const result = await request("PUT", { state: next, revision });
      revision = result.revision;
    } else {
      try {
        localStorage.setItem(demoKey, JSON.stringify(next));
      } catch {
        throw new Error("Your browser could not save the demo workspace. Check its storage settings or export your records.");
      }
    }
    state = next;
    render();
  } finally {
    busy = false;
  }
}

function useSnapshot(snapshot) {
  available = snapshot.available;
  signedIn = snapshot.signedIn;
  revision = snapshot.revision ?? null;
  state = signedIn ? snapshot.state : demoState();
  switchWorkspace("clean");
}

function getViews() {
  return [...(space === "raw" ? rawViews : cleanViews), ...state.views.filter((view) => view.space === space)];
}

function switchWorkspace(next) {
  space = next;
  search.value = "";
  selectView("all");
}

function selectView(id) {
  const view = getViews().find((item) => item.id === id) ?? getViews()[0];
  activeId = view.id;
  filters = view.filters ?? { signal: view.signal, status: view.status };
  sort = view.sort ?? { field: "", direction: "asc" };
  search.value = view.query ?? "";
  render();
}

function recordFields(record) {
  return space === "raw" ? record.contact ?? {} : record;
}

function visibleRecords() {
  const source = space === "raw" ? state.raw : state.contacts;
  const query = matchText(search.value).trim();
  const result = source.filter((record) => {
    const contact = recordFields(record);
    const signals = contact.buyingSignals ?? [];
    const haystack = [...FIELDS.map(({ key }) => contact[key]), ...signals.map((signal) =>
      [signal.label, signal.type, signal.evidence, signal.source].join(" "))];
    if (space === "raw") haystack.push(record.source, record.status, JSON.stringify(record.data));
    if (query && !haystack.some((value) => matchText(value).includes(query))) return false;
    if (filters.industry && contact.industry !== filters.industry) return false;
    if (filters.source && record.source !== filters.source) return false;
    if (filters.status && record.status !== filters.status) return false;
    if (filters.signal === "any" && !signals.length) return false;
    if (filters.signal === "verified" && !signals.some((signal) => signal.verified)) return false;
    if (filters.signal === "none" && signals.length) return false;
    return true;
  });

  if (sort.field) {
    const valueOf = (record) => {
      const contact = recordFields(record);
      if (sort.field === "buyingSignals") return contact.buyingSignals?.length ?? 0;
      return record[sort.field] ?? contact[sort.field] ?? record.data?.[sort.field] ?? "";
    };
    result.sort((left, right) => collator.compare(valueOf(left), valueOf(right)) *
      (sort.direction === "desc" ? -1 : 1));
  }
  return result;
}

function render() {
  const activeViews = getViews();
  renderWorkspace({
    space, records: visibleRecords(), views: activeViews, activeViewId: activeId,
    total: space === "raw" ? state.raw.length : state.contacts.length,
    columns: state.settings.customFields ?? [],
    stats: {
      contacts: state.contacts.length,
      withSignals: state.contacts.filter((contact) => contact.buyingSignals?.length).length,
      complete: state.contacts.filter((contact) => FIELDS.every(({ key }) => contact[key])).length,
      totalRaw: state.raw.length,
      pending: state.raw.filter(({ status }) => status === "pending").length,
      promoted: state.raw.filter(({ status }) => status === "promoted").length,
    },
  });
  dataMode.classList.toggle("is-private", signedIn);
  dataMode.innerHTML = '<span class="mode-dot"></span><span>' + (signedIn ? "Private workspace" : "Demo workspace") + "</span>";
  const named = $("workspace-name");
  if (named) named.textContent = state.settings.name?.trim() || "Relay Workspace";
  $("filter-action").classList.toggle("is-active", Object.values(filters).some(Boolean));
  $("sort-action").classList.toggle("is-active", Boolean(sort.field));
  $("filter-action").setAttribute("aria-pressed", String(Object.values(filters).some(Boolean)));
  $("sort-action").setAttribute("aria-pressed", String(Boolean(sort.field)));
}

const option = (value, title, current) => `<option value="${h(value)}"${value === current ? " selected" : ""}>${h(title)}</option>`;
const button = (label, action, attributes = "", style = "") =>
  `<button type="button" class="button ${style}" data-action="${action}" ${attributes}>${h(label)}</button>`;
const cancel = () => button("Cancel", "close-dialog");
const submit = (label) => `<button class="button button-primary" type="submit">${h(label)}</button>`;
const field = (label, control, wide = false) => `<label class="field${wide ? " field-wide" : ""}"><span>${h(label)}</span>${control}</label>`;
const input = (name, value = "", attrs = "") => `<input name="${h(name)}" value="${h(value)}" ${attrs}>`;
const select = (name, options) => `<select name="${h(name)}">${options.join("")}</select>`;
const textArea = (name, value = "", attrs = "") => `<textarea name="${h(name)}" ${attrs}>${h(value)}</textarea>`;
const actions = (content) => `<div class="dialog-actions">${content}</div>`;
const target = (id) => `data-id="${h(id)}"`;

function showForm(title, fields, label, handler, before = "", buttons = "") {
  openDialog(title, `<form id="editor-form">${before}<div class="form-grid">${fields}</div>
    <p class="form-error" role="alert" hidden></p>${actions(buttons + cancel() + submit(label))}</form>`);
  $("editor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter ?? form.querySelector('[type="submit"]');
    if (submitter?.disabled) return;
    const errorNode = form.querySelector(".form-error");
    errorNode.hidden = true;
    if (submitter) submitter.disabled = true;
    try {
      await handler(Object.fromEntries(new FormData(form)), form);
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    } finally {
      if (submitter) submitter.disabled = false;
    }
  });
}

function confirmAction(title, message, label, handler) {
  showForm(title, "", label, handler, '<p class="form-note">' + h(message) + '</p>');
}

function finished(message) {
  closeDialog();
  toast(message);
}

function contactFields(contact = {}, raw = false) {
  return FIELDS.map(({ key, label }) => {
    const attributes = key === "fullName" && !raw ? "required maxlength=160 autocomplete=name" :
      key === "email" ? (raw ? "inputmode=email maxlength=254" : "type=email maxlength=254") :
        key === "phone" ? "type=tel maxlength=80" : "maxlength=160";
    return field(label, input(key, contact[key], attributes), key === "fullName");
  }).join("");
}

function editContact(id) {
  const contact = state.contacts.find((item) => item.id === id);
  showForm(contact ? "Edit contact" : "Add contact", contactFields(contact), contact ? "Save contact" : "Add contact",
    async (values) => {
      const draft = { ...contact, ...values };
      const duplicates = duplicateCandidates(state, draft);
      if (duplicates.length && !contact) {
        confirmAction("Review possible duplicate",
          "This may duplicate " + duplicates.map((item) => item.fullName).join(", ") + ".",
          "Add separate contact", async () => {
            await commit(upsertContact(state, draft));
            finished("Contact added.");
          });
        return;
      }
      await commit(upsertContact(state, draft));
      finished(contact ? "Contact saved." : "Contact added.");
    });
}

function safelyLinked(url) {
  try {
    const parsed = new URL(url);
    if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password) return parsed.href;
  } catch {
    // Invalid source URLs are shown as text.
  }
  return "";
}

function signalCards(signals = [], id) {
  if (!signals.length) return '<p class="muted">No buying signals recorded.</p>';
  return `<div class="signal-list">${signals.map((signal) => {
    const url = safelyLinked(signal.url);
    const context = [signal.source, signal.date].filter(Boolean).join(" · ");
    const attrs = `${target(id)} data-signal="${h(signal.id)}"`;
    return `<article class="signal-card"><strong>${h(signal.label)}</strong>
      <span class="chip">${signal.verified ? "Verified" : "Unverified"}</span>
      ${signal.evidence ? `<p>${h(signal.evidence)}</p>` : ""}
      ${context ? `<p class="muted">${h(context)}</p>` : ""}
      ${url ? `<p><a href="${h(url)}" target="_blank" rel="noopener noreferrer">Open source ${icon("arrow-up-right")}</a></p>` : ""}
      ${id ? `<div class="signal-actions">${button(signal.verified ? "Mark unverified" : "Mark verified", "verify-signal", attrs, "button-small")}
        ${button("Remove", "delete-signal", attrs, "button-small")}</div>` : ""}
      </article>`;
  }).join("")}</div>`;
}

function openContact(id) {
  const contact = state.contacts.find((item) => item.id === id);
  if (!contact) return;
  const searchTerms = contact.businessName ? '"' + contact.businessName + '" (funding OR hiring OR expansion OR tender OR "new leadership")' : "";
  const researchUrl = "https://www.google.com/search?q=" + encodeURIComponent(searchTerms);
  const details = FIELDS.map(({ key, label }) => {
    const value = contact[key];
    let content = h(value || "—");
    if (value && key === "email") content = `<a href="mailto:${h(encodeURIComponent(value))}">${h(value)}</a>`;
    if (value && key === "phone") content = `<a href="tel:${h(value.replace(" x", ";ext="))}">${h(value)}</a>`;
    return `<div><dt>${h(label)}</dt><dd class="detail-value">${content}</dd></div>`;
  }).join("");
  openDialog(contact.fullName, `<div class="dialog-stack">
    <dl class="details-grid">${details}</dl>
    <section><div class="section-heading"><h3>Buying signals</h3>${button("Add signal", "add-signal", target(id), "button-small")}</div>
    ${signalCards(contact.buyingSignals, id)}
    ${searchTerms ? `<p class="form-note"><a href="${h(researchUrl)}" target="_blank" rel="noopener noreferrer">Research public company signals ${icon("arrow-up-right")}</a></p>` : ""}</section>
    </div>${actions(button("Delete contact", "delete-contact", target(id), "button-danger") +
      button("Edit contact", "edit-contact", target(id), "button-primary"))}`);
}

function signalEditor(id) {
  showForm("Add buying signal", [
    field("Signal type", select("type", SIGNAL_TYPES.map((type) => option(type, type)))),
    field("Observed date", input("date", "", "type=date")),
    field("Label", input("label", "", "maxlength=160")),
    field("Source name", input("source", "", "maxlength=160")),
    field("Source URL", input("url", "", 'type=url maxlength=1500 placeholder="https://"'), true),
    field("Evidence", textArea("evidence", "", "rows=3 maxlength=3000"), true),
  ].join(""), "Add signal", async (values) => {
    await commit(addSignal(state, id, values));
    toast("Buying signal added.");
    openContact(id);
  });
}

function rawDetails(id) {
  const item = state.raw.find((row) => row.id === id);
  if (!item) return;
  const title = item.contact.fullName || "Review raw record";
  const source = `<p class="form-note">Source <strong>${h(item.source)}</strong> · ${item.status === "pending" ? "Needs review" : h(item.status)}</p>`;
  const original = `<details${item.status === "pending" ? "" : " open"}><summary>Original source fields</summary><pre class="raw-preview">${h(JSON.stringify(item.data, null, 2))}</pre></details>`;
  const signals = item.contact.buyingSignals?.length
    ? `<section><h3>Extracted signals</h3>${signalCards(item.contact.buyingSignals)}</section>` : "";
  if (item.status === "promoted") {
    const contact = state.contacts.find(({ id: key }) => key === item.contactId);
    openDialog(title, `<div class="dialog-stack">${source}${original}${signals}</div>${actions(contact ?
      button("Open sales contact", "view-contact", target(contact.id), "button-primary") : button("Close", "close-dialog"))}`);
    return;
  }
  if (item.status === "dismissed") {
    openDialog(title, `<div class="dialog-stack">${source}${original}${signals}</div>${actions(cancel() +
      button("Restore to review", "restore-raw", target(id), "button-primary"))}`);
    return;
  }

  const details = `<div class="dialog-stack">${source}${original}${signals}</div>`;
  const editorButtons = button("Dismiss", "dismiss-raw", target(id), "button-danger") +
    '<button type="button" class="button" id="save-draft">Save draft</button>';
  showForm(title, contactFields(item.contact, true), "Promote to Sales CRM", async (values) => {
    try {
      await commit(promoteRaw(state, id, { contact: values }));
      finished("Contact promoted to Sales CRM.");
    } catch (error) {
      if (error.code !== "DUPLICATE") throw error;
      mergeDialog(id, values, error.candidates);
    }
  }, details, editorButtons);
  $("save-draft").addEventListener("click", async (event) => {
    const trigger = event.currentTarget;
    const form = trigger.closest("form");
    const errorNode = form.querySelector(".form-error");
    trigger.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      await commit(updateRaw(state, id, { contact: values }));
      finished("Review draft saved.");
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    } finally {
      trigger.disabled = false;
    }
  });
}

function mergeDialog(id, contact, candidates) {
  const options = candidates.map((candidate) => option(candidate.id, [candidate.fullName, candidate.businessName || candidate.email].filter(Boolean).join(" · ")));
  options.push(option("separate", "Create a separate contact"));
  showForm("Review possible duplicate", field("Sales contact", select("destination", options), true),
    "Confirm promotion", async ({ destination }) => {
      await commit(promoteRaw(state, id, { contact, mergeWith: destination === "separate" ? null : destination, allowDuplicate: destination === "separate" }));
      finished(destination === "separate" ? "Separate contact created." : "Contact merged and source record kept.");
    }, '<p class="form-note">Merging fills gaps on the existing contact and adds the source’s buying signals.</p>');
}

function addRaw() {
  const extra = state.settings.customFields ?? [];
  showForm("Add raw record", contactFields({}, true) +
    field("Source", input("relaySource", "", "maxlength=200"), true) +
    field("Source notes", textArea("Notes", "", "rows=3 maxlength=4000"), true) +
    extra.map(({ key, label }) => field(label, input("custom:" + key, "", "maxlength=4000"))).join(""),
  "Add to review", async ({ relaySource, ...values }) => {
    const row = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()).map(([key, value]) => [key.replace(/^custom:/, ""), value]));
    if (!Object.keys(row).length) throw new Error("Add at least one source field.");
    await commit(importRaw(state, [row], { source: relaySource }));
    finished("Raw record added to review.");
  });
}

function filterDialog() {
  const records = space === "raw" ? state.raw : state.contacts;
  const industries = [...new Set(records.map((row) => recordFields(row).industry).filter(Boolean))].sort(collator.compare);
  const sources = [...new Set(state.raw.map((row) => row.source).filter(Boolean))].sort(collator.compare);
  const rawFields = space === "raw" ? [
    field("Review status", select("status", [["", "Any status"], ["pending", "Needs review"], ["promoted", "Promoted"], ["dismissed", "Dismissed"]].map(([v, label]) => option(v, label, filters.status)))),
    field("Source", select("source", [option("", "Any source", filters.source), ...sources.map((value) => option(value, value, filters.source))])),
  ].join("") : "";
  showForm("Filter records", field("Industry", select("industry", [option("", "Any industry", filters.industry), ...industries.map((value) => option(value, value, filters.industry))])) +
    field("Buying signals", select("signal", [["", "Any"], ["any", "Has buying signals"], ["verified", "Has verified signals"], ["none", "No signals"]].map(([v, label]) => option(v, label, filters.signal)))) + rawFields,
  "Apply filters", (values) => { filters = values; render(); closeDialog(); }, "", button("Clear filters", "clear-filters"));
}

function sortDialog() {
  const columns = [...FIELDS, { key: "buyingSignals", label: "Buying signal count" }, { key: "createdAt", label: "Date added" }];
  if (space === "raw") columns.push({ key: "source", label: "Source" }, { key: "status", label: "Review status" }, ...(state.settings.customFields ?? []));
  showForm("Sort records", field("Sort by", select("field", [option("", "Workspace order", sort.field),
    ...columns.map(({ key, label }) => option(key, label, sort.field))])) +
    field("Direction", select("direction", [option("asc", "Ascending", sort.direction), option("desc", "Descending", sort.direction)])),
  "Apply sort", (values) => { sort = values; render(); closeDialog(); });
}

function viewDialog() {
  const editable = state.views.find((view) => view.id === activeId && view.space === space);
  const tools = editable ? '<button type="button" class="button button-danger" id="remove-view">Delete current view</button>' : "";
  showForm("Save a view", field("View name", input("name", editable?.name, "required maxlength=50"), true),
    editable ? "Update current view" : "Save view", async ({ name }) => {
      const clean = name.trim();
      if (!clean) throw new Error("Enter a view name.");
      if (getViews().some((item) => item.id !== editable?.id && matchText(item.name) === matchText(clean))) {
        throw new Error("A view with that name already exists.");
      }
      const id = editable?.id ?? crypto.randomUUID();
      const view = { id, name: clean, space, filters, sort, query: search.value.trim() };
      await commit({ ...state, views: [...state.views.filter((item) => item.id !== id), view] });
      selectView(id);
      finished("View saved.");
    }, '<p class="form-note">Save your current search, filters, and sorting as a workspace tab.</p>', tools);
  if (editable) $("remove-view").addEventListener("click", async () => {
    try {
      await commit({ ...state, views: state.views.filter(({ id }) => id !== activeId) });
      selectView("all");
      finished("View deleted.");
    } catch (error) {
      toast(error.message, { error: true });
    }
  });
}

function settingsDialog() {
  const aliases = state.settings.aliases ?? DEFAULT_ALIASES;
  const columns = (state.settings.customFields ?? []).map(({ key, label }) => key === label ? key : key + " | " + label).join("\n");
  const aliasFields = [...FIELDS, { key: "buyingSignals", label: "Buying signals" }]
    .map(({ key, label }) => field(label + " aliases", input("alias:" + key, (aliases[key] ?? []).join(", "), "maxlength=1000"), true)).join("");
  showForm("Workspace settings", field("Workspace name", input("name", state.settings.name ?? "", 'maxlength=60 placeholder="Relay Workspace"'), true) +
    field("Extra Data Lab columns", textArea("columns", columns, 'rows=4 maxlength=2000 placeholder="Region | Market region"'), true) + aliasFields,
  "Save settings", async ({ name, columns: columnText, ...values }) => {
    const seen = new Set(["fullName", "businessName", "email", "source", "status", "rawFields"]);
    const customFields = columnText.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
      const [key, title] = line.split("|", 2).map((part) => part.trim());
      if (!key || key.length > 100 || seen.has(key) || ["__proto__", "constructor", "prototype"].includes(key)) {
        throw new Error("Enter a unique original header for each Data Lab column.");
      }
      seen.add(key);
      return { key, label: title || key };
    });
    if (customFields.length > 20) throw new Error("Add up to 20 extra Data Lab columns.");
    const nextAliases = { ...aliases };
    for (const [name, value] of Object.entries(values)) {
      nextAliases[name.slice(6)] = [...new Set(value.split(",").map((alias) => alias.trim()).filter(Boolean))];
    }
    await commit({ ...state, settings: { ...state.settings, name: name.trim(), aliases: nextAliases, customFields } });
    finished("Workspace settings saved.");
  }, '<p class="form-note">Use one original header per line for Data Lab columns. Add an optional label after a vertical bar. Separate import aliases with commas.</p>');
}

function exportDialog() {
  showForm("Export records", field("Records", select("scope", [option("visible", "Current view"), option("all", "Entire workspace")]), true) +
    field("Format", select("format", [option("csv", "CSV spreadsheet"), option("json", "JSON data")]), true),
  "Download", ({ scope, format }) => {
    const key = space === "raw" ? "raw" : "contacts";
    const records = scope === "visible" ? visibleRecords() : state[key];
    const data = space === "raw" ? records : records.map((contact) => {
      const fields = [...FIELDS.map(({ key }) => key), "buyingSignals"];
      return Object.fromEntries(fields.map((key) => [key, contact[key]]));
    });
    const content = format === "csv" ? exportCsv({ ...state, [key]: records }, space) : JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (space === "raw" ? "relay-data-lab" : "relay-sales-contacts") + "." + format;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    finished("Export downloaded.");
  });
}

function accountDialog() {
  if (signedIn) {
    openDialog("Private workspace", '<p class="form-note">Your records are saved securely and available on devices you sign in to.</p>' +
      actions(button("Sign out", "sign-out") + button("Done", "close-dialog", "", "button-primary")));
    return;
  }
  if (!available) {
    openDialog("Demo workspace", '<p class="form-note">The demo starts with fictional records and saves changes in this browser. Private cloud storage is currently unavailable.</p>' +
      actions(button("Reset demo", "reset-demo", "", "button-danger") + button("Done", "close-dialog", "", "button-primary")));
    return;
  }
  showForm("Open private workspace", field("Workspace access key", input("key", "", 'type=password required maxlength=128 autocomplete=current-password'), true),
    "Sign in", async ({ key }) => {
      useSnapshot(await request("POST", { key: key.trim() }));
      finished("Private workspace opened.");
    }, '<p class="form-note">Enter your access key to work with your private records. The demo saves its own fictional data in this browser.</p>',
    button("Reset demo", "reset-demo", "", "button-danger"));
}

async function act(action, control) {
  const { id, signal } = control.dataset;
  switch (action) {
    case "clean":
    case "raw":
      switchWorkspace(action);
      break;
    case "view":
      selectView(id);
      break;
    case "record":
      if (space === "raw") rawDetails(id);
      else openContact(id);
      break;
    case "add":
      if (space === "raw") addRaw();
      else editContact();
      break;
    case "import":
      openImport({
        getState: () => state, commit,
        onImported: (count) => { switchWorkspace("raw"); finished(count + (count === 1 ? " raw record imported." : " raw records imported.")); },
      });
      break;
    case "view-contact":
      switchWorkspace("clean");
      openContact(id);
      break;
    case "edit-contact": editContact(id); break;
    case "delete-contact":
      confirmAction("Delete contact", "This deletes the sales contact. Its source records will return to Data Lab review.", "Delete contact", async () => {
        await commit(removeContact(state, id));
        finished("Contact deleted.");
      });
      break;
    case "dismiss-raw":
      await commit(updateRaw(state, id, { status: "dismissed" }));
      finished("Raw record dismissed.");
      break;
    case "restore-raw":
      await commit(updateRaw(state, id, { status: "pending" }));
      rawDetails(id);
      toast("Raw record restored.");
      break;
    case "add-signal": signalEditor(id); break;
    case "verify-signal": {
      const item = state.contacts.find((contact) => contact.id === id)?.buyingSignals.find((entry) => entry.id === signal);
      if (!item) break;
      await commit(verifySignal(state, id, signal, !item.verified));
      openContact(id);
      break;
    }
    case "delete-signal":
      confirmAction("Remove buying signal", "This removes the signal and its evidence from this sales contact.", "Remove signal", async () => {
        await commit(removeSignal(state, id, signal));
        openContact(id);
      });
      break;
    case "settings": settingsDialog(); break;
    case "filter": filterDialog(); break;
    case "sort": sortDialog(); break;
    case "clear-filters":
      filters = {};
      render();
      closeDialog();
      break;
    case "new-view": viewDialog(); break;
    case "export": exportDialog(); break;
    case "account": accountDialog(); break;
    case "sign-out":
      if (busy) throw new Error("Wait for the current save to finish.");
      await request("DELETE");
      useSnapshot({ available, signedIn: false });
      finished("Signed out.");
      break;
    case "reset-demo":
      confirmAction("Reset demo", "This replaces changes in this browser with the original sample data.", "Reset demo", async () => {
        await commit(createWorkspace({ demo: true }));
        switchWorkspace("clean");
        finished("Demo reset.");
      });
      break;
    case "close-dialog": closeDialog(); break;
  }
}

document.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-action]");
  if (!control || control.disabled) return;
  try {
    await act(control.dataset.action, control);
  } catch (error) {
    toast(error.message, { error: true });
  }
});
search.addEventListener("input", render);
document.addEventListener("keydown", (event) => {
  if ((event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) &&
    !event.target.matches("input,textarea,select,[contenteditable]") && !$("dialog").open) {
    event.preventDefault();
    search.focus();
  }
});

async function initialize() {
  render();
  const key = new URLSearchParams(location.hash.slice(1)).get("access");
  if (key) {
    history.replaceState(null, "", location.pathname + location.search);
    try {
      useSnapshot(await request("POST", { key }));
      toast("Private workspace opened.");
      return;
    } catch (error) {
      toast(error.message, { error: true });
    }
  }
  try {
    const snapshot = await request();
    if (snapshot.signedIn) useSnapshot(snapshot);
    else available = snapshot.available;
  } catch {
    // The browser demo remains usable without the private service.
  }
}

initialize();
