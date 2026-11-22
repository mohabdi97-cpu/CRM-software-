import { applyAstryx, astryxGlyph } from './design.js';

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const numberFormat = new Intl.NumberFormat();
const cleanColumns = [
  { key: 'fullName', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'businessName', label: 'Business name' },
  { key: 'industry', label: 'Industry' },
  { key: 'buyingSignals', label: 'Buying signals' },
];
const rawColumns = [
  { key: 'fullName', label: 'Full name' },
  { key: 'businessName', label: 'Business name' },
  { key: 'email', label: 'Email' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Review status' },
  { key: 'rawFields', label: 'Raw fields' },
];
const statusLabels = { pending: 'Needs review', promoted: 'Promoted', dismissed: 'Dismissed' };
const byId = (id) => document.getElementById(id);
let toastTimer;

export function icon(name) {
  return astryxGlyph(name === 'add' ? 'plus' : name) || '';
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

export function signalBadges(signals, limit = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(signals) || !signals.length) return '<span class="empty-value">—</span>';
  const badges = signals.slice(0, limit).map((signal) => {
    const label = typeof signal === 'string' ? signal : signal?.label || signal?.type || 'Signal';
    return `<span class="chip chip-signal" title="${escapeHtml(label)}">${icon('signal')}${escapeHtml(label)}</span>`;
  });
  if (signals.length > limit) badges.push(`<span class="chip chip-more" title="${signals.length - limit} more signals">+${signals.length - limit}</span>`);
  return `<span class="chips">${badges.join('')}</span>`;
}

function formatNumber(value) {
  return numberFormat.format(value ?? 0);
}

function metric(symbol, label, value, color) {
  return `<div class="metric"><span class="metric-icon ${color}">${icon(symbol)}</span><div><span class="metric-label">${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div></div>`;
}

function renderMetrics(raw, stats, records, total) {
  if (raw) {
    const pending = stats.pending ?? records.filter((record) => record.status === 'pending').length;
    const promoted = stats.promoted ?? records.filter((record) => record.status === 'promoted').length;
    return [metric('database', 'Raw records', stats.totalRaw ?? total, 'metric-mint'), metric('clock', 'Needs review', pending, 'metric-amber'), metric('check-circle', 'Promoted to sales', promoted, 'metric-blue')].join('');
  }
  const withSignals = stats.withSignals ?? records.filter((record) => (record.buyingSignals || record.signals)?.length).length;
  const complete = stats.complete ?? records.filter((record) => cleanColumns.slice(0, 5).every(({ key }) => record[key])).length;
  return [metric('users', 'Sales contacts', stats.contacts ?? total, 'metric-mint'), metric('signal', 'With buying signals', withSignals, 'metric-amber'), metric('check-circle', 'Complete profiles', complete, 'metric-blue')].join('');
}

function renderTabs(views, activeId) {
  return views.map((view, index) => {
    const active = activeId == null ? index === 0 : String(view.id) === String(activeId);
    return `<button class="view-tab${active ? ' is-active' : ''}" type="button" data-action="view" data-id="${escapeHtml(view.id)}" aria-pressed="${active}">${icon('table')}<span>${escapeHtml(view.name)}</span></button>`;
  }).join('');
}

function renderName(record, value, raw) {
  const name = typeof value === 'string' ? value.trim() : '';
  const initials = name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase();
  const tones = ['sage', 'violet', 'peach', 'blue', 'rose', 'sand'];
  const tone = tones[Array.from(name).reduce((sum, character) => sum + character.codePointAt(0), 0) % tones.length];
  return `<button class="contact-button" type="button" data-action="record" data-id="${escapeHtml(record.id)}"><span class="record-avatar avatar-${tone}" aria-hidden="true">${initials ? escapeHtml(initials) : icon('user')}</span><span>${escapeHtml(name || (raw ? 'Unnamed record' : 'Unnamed contact'))}</span></button>`;
}

function cellText(value) {
  if (value === null || value === undefined || value === '') return '<span class="empty-value">—</span>';
  const label = typeof value === 'object' ? (Array.isArray(value) ? value.join(', ') : JSON.stringify(value)) : value;
  return `<span class="cell-text" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}

function renderCell(record, key, raw) {
  const contact = raw ? record.contact || record : record;
  const value = contact[key] ?? contact.custom?.[key] ?? record.data?.[key];
  if (key === 'fullName') return renderName(record, value, raw);
  if (key === 'buyingSignals') return signalBadges(contact.buyingSignals || contact.signals, 1);
  if (key === 'industry') return value ? `<span class="chip chip-industry" title="${escapeHtml(value)}">${escapeHtml(value)}</span>` : cellText(value);
  if (key === 'phone') return `<span class="phone-number">${cellText(value)}</span>`;
  if (key === 'source') return record.source ? `<span class="source-cell">${icon('inbox')}${cellText(record.source)}</span>` : cellText(value);
  if (key === 'status') {
    const status = Object.hasOwn(statusLabels, record.status) ? record.status : 'pending';
    return `<span class="chip chip-${status}"><span class="status-dot"></span>${statusLabels[status]}</span>`;
  }
  if (key === 'rawFields') {
    const fields = Object.keys(record.data || record.original || record.raw || {}).length;
    return `<span class="raw-field-count">${formatNumber(fields)} ${fields === 1 ? 'field' : 'fields'}</span>`;
  }
  return cellText(value);
}

function renderTable(rows, columns, raw, total, query) {
  byId('table-head').innerHTML = `<tr>${columns.map(({ key, label }) => `<th scope="col" class="column-${escapeHtml(key)}">${escapeHtml(label)}</th>`).join('')}<th class="row-actions" scope="col"><span class="sr-only">Details</span></th></tr>`;
  if (!rows.length) {
    const narrowed = total > 0 || query;
    const title = narrowed ? 'No matching records' : raw ? 'No raw records yet' : 'No sales contacts yet';
    const hint = narrowed ? 'Try changing your search or filters.' : raw ? 'Import a CSV or add a record to start your review.' : 'Add a contact or promote a reviewed record from Data Lab.';
    byId('table-body').innerHTML = `<tr><td class="table-empty-cell" colspan="${columns.length + 1}"><div class="empty-state"><span class="empty-icon">${icon(narrowed ? 'search' : 'inbox')}</span><strong>${title}</strong><p>${hint}</p>${narrowed ? '' : `<button class="button button-small button-primary" type="button" data-action="${raw ? 'import' : 'add'}">${icon(raw ? 'upload' : 'plus')}${raw ? 'Import data' : 'Add contact'}</button>`}</div></td></tr>`;
    return;
  }
  byId('table-body').innerHTML = rows.map((record) => `<tr>${columns.map(({ key }) => `<td class="column-${escapeHtml(key)}">${renderCell(record, key, raw)}</td>`).join('')}<td class="row-actions"><button class="icon-button row-action" type="button" data-action="record" data-id="${escapeHtml(record.id)}" title="Open record" aria-label="Open ${escapeHtml((raw ? record.contact : record)?.fullName || 'record')}">${icon('chevron-right')}</button></td></tr>`).join('');
}

function setCount(id, value) {
  const element = byId(id);
  element.hidden = value === undefined;
  const label = element.querySelector('[data-relay-text]') || element;
  label.textContent = value === undefined ? '' : formatNumber(value);
}

export function renderWorkspace({ space = 'clean', records = [], views = [], activeViewId, stats = {}, total = records.length, columns } = {}) {
  const raw = space === 'raw';
  const name = raw ? 'Data Lab' : 'Sales CRM';
  const activeNav = byId(raw ? 'nav-raw' : 'nav-clean');
  const inactiveNav = byId(raw ? 'nav-clean' : 'nav-raw');
  activeNav.classList.add('is-active');
  activeNav.setAttribute('aria-current', 'page');
  inactiveNav.classList.remove('is-active');
  inactiveNav.removeAttribute('aria-current');
  byId('breadcrumb-current').textContent = name;
  byId('workspace-title').textContent = name;
  byId('workspace-description').textContent = raw ? 'Collect source data, review the details, and promote sales-ready contacts.' : 'Work your approved contacts and follow up on buying signals.';
  byId('workspace-indicator').innerHTML = icon(raw ? 'flask' : 'users');
  byId('workspace-indicator').classList.toggle('is-lab', raw);
  byId('primary-action').innerHTML = `${icon('plus')}<span>${raw ? 'Add record' : 'Add contact'}</span>`;
  byId('search').placeholder = raw ? 'Search raw records…' : 'Search contacts…';
  byId('search').previousElementSibling.textContent = raw ? 'Search raw records' : 'Search contacts';
  byId('records-table').classList.toggle('is-raw', raw);
  byId('table-caption').textContent = raw ? 'Raw records' : 'Sales contacts';
  setCount('clean-count', stats.contacts ?? (raw ? undefined : total));
  setCount('raw-count', stats.totalRaw ?? (raw ? total : undefined));
  byId('metrics').innerHTML = renderMetrics(raw, stats, records, total);
  const shownViews = views.length ? views : [{ id: 'all', name: raw ? 'All records' : 'All contacts' }];
  byId('view-tabs').innerHTML = renderTabs(shownViews, activeViewId);
  const extraColumns = (columns || []).map((column) => typeof column === 'string' ? { key: column, label: column } : { key: column.key || column.id || column.name, label: column.label || column.name || column.key }).filter((column) => column.key && column.label);
  const selectedColumns = raw ? [...rawColumns, ...extraColumns.filter((column) => !rawColumns.some((standard) => standard.key === column.key))] : cleanColumns;
  byId('records-table').classList.toggle('has-extra-columns', raw && selectedColumns.length > rawColumns.length);
  renderTable(records, selectedColumns, raw, total, byId('search').value.trim());
  const label = raw ? (total === 1 ? 'record' : 'records') : (total === 1 ? 'contact' : 'contacts');
  const count = records.length === total ? formatNumber(total) : `${formatNumber(records.length)} of ${formatNumber(total)}`;
  const foot = byId('table-footer');
  foot.innerHTML = `<span><strong>${count}</strong> ${label}</span><span class="footer-context">${icon(raw ? 'flask' : 'check-circle')}${raw ? 'Data Lab records' : 'Approved for sales'}</span>`;
  byId('records').setAttribute('aria-busy', 'false');
  applyAstryx();
}

function setStaticIcons(container) {
  for (const element of container.querySelectorAll('[data-icon]')) {
    element.innerHTML = icon(element.dataset.icon);
  }
}

export function openDialog(title, body) {
  const dialog = byId('dialog');
  byId('dialog-title').textContent = title;
  const dialogBody = byId('dialog-body');
  if (body instanceof Node) dialogBody.replaceChildren(body);
  else dialogBody.innerHTML = body;
  setStaticIcons(dialogBody);
  applyAstryx(dialogBody);
  if (!dialog.open) dialog.showModal();
  const firstField = dialogBody.querySelector('[autofocus], input:not([type="hidden"]), textarea, select');
  if (firstField) firstField.focus();
}

export function closeDialog() {
  byId('dialog').close();
}

export function toast(message, { error = false } = {}) {
  const element = byId('toast');
  clearTimeout(toastTimer);
  element.classList.toggle('is-error', error);
  element.innerHTML = `${icon(error ? 'alert' : 'check-circle')}<span>${escapeHtml(message)}</span>`;
  element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, error ? 7000 : 4200);
}

setStaticIcons(document);

applyAstryx();
