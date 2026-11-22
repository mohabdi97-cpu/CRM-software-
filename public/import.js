import { FIELDS, importRaw, normalizeRow, parseImport } from "./domain.js";
import { closeDialog, escapeHtml, icon, openDialog, toast } from "./ui.js";

const CORE_FIELDS = [...FIELDS, { key: "buyingSignals", label: "Buying signals" }];
const OPTIONAL_FIELDS = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "signalType", label: "Signal type" },
  { key: "signalEvidence", label: "Signal evidence" },
  { key: "signalSource", label: "Signal source" },
  { key: "signalUrl", label: "Signal source URL" },
  { key: "signalDate", label: "Signal date" },
];
const number = new Intl.NumberFormat();

function importHeaders(rows) {
  const headers = new Set();

  function addEntries(value, prefix, depth) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, entry] of Object.entries(value)) {
      const path = prefix + key;
      headers.add(path);
      if (depth > 0) addEntries(entry, path + ".", depth - 1);
    }
  }

  for (const row of rows) addEntries(row, "", 3);
  return [...headers];
}

function showError(form, error) {
  const message = form.querySelector(".form-error");
  message.textContent = error instanceof Error ? error.message : String(error);
  message.hidden = false;
}

function setBusy(form, pending, label) {
  const action = form.querySelector('[type="submit"]');
  const back = form.querySelector("[data-import-back]");
  action.disabled = pending;
  action.textContent = label;
  if (back) back.disabled = pending;
  form.setAttribute("aria-busy", String(pending));
}

export function openImport({ getState, commit, onImported }) {
  let file;
  let pasted = "";
  let rows;
  let headers;
  let source = "";
  let mapping = {};
  let parsedFile;
  let parsedPaste;

  function chooseData() {
    openDialog("Import data", `
      <form id="import-input" class="dialog-stack">
        <p class="form-note">Choose a CSV, TSV or JSON file, or paste your records below. Include column headers for CSV and TSV.</p>
        <label class="field">
          Upload a file
          <input name="file" type="file" accept=".csv,.tsv,.json,text/csv,text/tab-separated-values,application/json">
        </label>
        <div class="form-note" data-import-selection aria-live="polite"></div>
        <label class="field">
          Paste records
          <textarea name="data" rows="5" spellcheck="false" placeholder="Full name,Email,Business name"></textarea>
        </label>
        <p class="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          <button type="button" class="button" data-import-cancel>Cancel</button>
          <button type="submit" class="button button-primary">Review mapping</button>
        </div>
      </form>
    `);
    const form = document.getElementById("import-input");
    const fileInput = form.elements.file;
    const pasteInput = form.elements.data;
    const selection = form.querySelector("[data-import-selection]");
    const updateSelection = () => { selection.textContent = file ? "Selected file " + file.name : ""; };
    pasteInput.value = pasted;
    updateSelection();

    fileInput.addEventListener("change", () => {
      file = fileInput.files[0];
      if (file) pasteInput.value = "";
      updateSelection();
    });
    pasteInput.addEventListener("input", () => {
      if (!pasteInput.value) return;
      file = undefined;
      fileInput.value = "";
      updateSelection();
    });
    form.querySelector("[data-import-cancel]").addEventListener("click", closeDialog);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (form.getAttribute("aria-busy") === "true") return;
      pasted = pasteInput.value;
      if (!file && !pasted.trim()) {
        showError(form, "Choose a file or paste records to continue.");
        return;
      }
      setBusy(form, true, "Reading records…");
      try {
        const selectedFile = file;
        const pastedContent = pasted;
        const unchanged = rows && selectedFile === parsedFile && pastedContent === parsedPaste;
        const nextRows = unchanged ? rows : parseImport(
          selectedFile ? await selectedFile.text() : pastedContent,
          selectedFile?.name,
        );
        if (!form.isConnected || !form.closest("dialog")?.open) return;
        if (!unchanged) {
          rows = nextRows;
          headers = importHeaders(rows);
          source = selectedFile?.name || "Pasted records";
          mapping = {};
          parsedFile = selectedFile;
          parsedPaste = pastedContent;
        }
        mapRecords();
      } catch (error) {
        showError(form, error);
      } finally {
        setBusy(form, false, "Review mapping");
      }
    });
  }

  function mappingMenu(field) {
    const options = headers.map((header, index) => {
      const selected = Object.hasOwn(mapping, field.key) && mapping[field.key] === header;
      return `<option value="header-${index}"${selected ? " selected" : ""}>${escapeHtml(header || "Unlabelled field")}</option>`;
    });
    return `
      <label class="field">
        ${escapeHtml(field.label)}
        <select data-field="${escapeHtml(field.key)}">
          <option value="auto">Auto-detect</option>
          <option value="skip"${mapping[field.key] === "" ? " selected" : ""}>Leave unmapped</option>
          ${options.join("")}
        </select>
      </label>
    `;
  }

  function mapRecords() {
    const count = number.format(rows.length);
    openDialog("Map import fields", `
      <form id="import-mapping" class="dialog-stack">
        <p class="form-note">${count} ${rows.length === 1 ? "record is" : "records are"} ready for Data Lab. Every original field is kept. Review and promote the matching fields to Sales CRM when ready.</p>
        <label class="field">
          Import source
          <input name="source" value="${escapeHtml(source)}" required>
        </label>
        <div class="form-grid">${CORE_FIELDS.map(mappingMenu).join("")}</div>
        <details>
          <summary>Additional name and signal fields</summary>
          <div class="form-grid">${OPTIONAL_FIELDS.map(mappingMenu).join("")}</div>
        </details>
        <section aria-labelledby="import-preview-heading">
          <h3 id="import-preview-heading">First record preview</h3>
          <dl class="details-grid signal-card" data-import-preview aria-live="polite"></dl>
        </section>
        <p class="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          <button type="button" class="button" data-import-back>Back</button>
          <button type="submit" class="button button-primary">${icon("upload")} Import ${count} ${rows.length === 1 ? "record" : "records"}</button>
        </div>
      </form>
    `);
    const form = document.getElementById("import-mapping");
    const previewElement = form.querySelector("[data-import-preview]");
    const submit = form.querySelector('[type="submit"]');
    const actionContent = submit.innerHTML;

    function updatePreview() {
      const contact = normalizeRow(rows[0], { mapping, aliases: getState().settings?.aliases, source });
      const preview = { ...contact, buyingSignals: contact.buyingSignals.map((signal) => signal.label).join(", ") };
      previewElement.innerHTML = CORE_FIELDS.map(({ key, label }) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${preview[key] ? escapeHtml(preview[key]) : "—"}</dd></div>`,
      ).join("");
    }

    form.addEventListener("change", (event) => {
      const { target } = event;
      if (target.name === "source") {
        source = target.value;
      } else if (target.dataset.field) {
        const key = target.dataset.field;
        if (target.value === "auto") delete mapping[key];
        else if (target.value === "skip") mapping[key] = "";
        else mapping[key] = headers[Number(target.value.slice("header-".length))];
      }
      updatePreview();
    });
    form.querySelector("[data-import-back]").addEventListener("click", chooseData);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      source = form.elements.source.value.trim();
      if (!source) {
        showError(form, "Enter the name of the import source.");
        form.elements.source.focus();
        return;
      }
      form.querySelector(".form-error").hidden = true;
      setBusy(form, true, "Importing…");
      try {
        await commit(importRaw(getState(), rows, { source, mapping }));
      } catch (error) {
        if (form.isConnected && form.closest("dialog")?.open) showError(form, error);
        else toast(error.message || String(error), { error: true });
        setBusy(form, false, "Import records");
        submit.innerHTML = actionContent;
        return;
      }
      if (form.isConnected && form.closest("dialog")?.open) closeDialog();
      onImported?.(rows.length);
    });
    updatePreview();
  }

  chooseData();
}
