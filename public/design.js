// Astryx renders these specimens at build time. Keep Relay's native controls
// and stable event hooks while taking component structure and styling from them.
const templates = await import('./astryx/markup.js').then((module) => module.default).catch(() => null);
const specimenCache = new Map();

function specimen(markup, selector) {
  if (!markup) return null;
  const key = `${selector}\n${markup}`;
  if (!specimenCache.has(key)) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    specimenCache.set(key, template.content.querySelector(selector));
  }
  return specimenCache.get(key);
}

function applyStyle(element, source, type) {
  if (!source || !element) return;
  for (const name of source.classList) element.classList.add(name);
  for (const { name, value } of source.attributes) {
    if (name.startsWith('data-')) element.setAttribute(name, value);
  }
  element.dataset.relayDesign = type;
}

function replaceMarker(root, value) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let text = walk.nextNode(); text; text = walk.nextNode()) {
    if (text.data.includes('ASTRYX_CONTENT')) text.data = text.data.replace('ASTRYX_CONTENT', value);
  }
}

function useButton(button) {
  if (button.dataset.relayDesign === 'button' && button.querySelector('[data-relay-label]')) return;
  const primary = button.classList.contains('button-primary');
  const destructive = button.classList.contains('button-danger');
  const small = button.matches('.button-small, .icon-button, .mode-button, .view-tab');
  const ghost = button.matches('.icon-button, .view-tab');
  const label = button.textContent.trim();
  const symbol = button.querySelector('[data-icon], .relay-glyph, svg, .mode-dot');
  const content = symbol ? (label ? 'icon-label' : 'icon') : 'label';
  const variant = primary ? 'primary' : destructive ? 'destructive' : ghost ? 'ghost' : 'secondary';
  const key = `${variant}-${small ? 'sm' : 'md'}-${content}`;
  const generated = specimen(templates.buttons[key], 'button');
  if (!generated) return;
  const layout = generated.cloneNode(true);
  const slot = layout.querySelector('[data-relay-icon]');
  if (slot && symbol) slot.replaceWith(symbol);
  replaceMarker(layout, label);
  applyStyle(button, generated, 'button');
  if (content === 'icon' && !button.hasAttribute('aria-label')) button.setAttribute('aria-label', button.title || 'Open');
  const signature = document.createElement('span');
  signature.hidden = true;
  signature.dataset.relayLabel = '';
  button.replaceChildren(...layout.childNodes, signature);
}

function useBadge(badge) {
  if (badge.dataset.relayDesign === 'badge') return;
  const variant = badge.matches('.chip-pending') ? 'warning' : badge.matches('.chip-promoted') ? 'success' : badge.matches('.chip-signal') ? 'green' : 'neutral';
  const generated = specimen(templates.badges[variant], '[data-astryx-theme] > span');
  if (!generated) return;
  const layout = generated.cloneNode(true);
  const label = badge.textContent.trim();
  const symbol = badge.querySelector('.relay-glyph, svg, .status-dot');
  const slot = layout.querySelector('[data-relay-icon]');
  if (symbol) slot?.replaceWith(symbol);
  else slot?.remove();
  const text = layout.querySelector('[data-relay-text]');
  if (text) text.textContent = label;
  applyStyle(badge, generated, 'badge');
  badge.replaceChildren(...layout.childNodes);
}

export function astryxGlyph(name) {
  const markup = templates?.glyphs[name];
  const source = specimen(markup, '.relay-glyph');
  return source?.querySelector('svg') || source?.matches('svg') ? source.outerHTML : null;
}

export function applyAstryx(container = document) {
  if (!templates) return;
  const components = [
    ['#workspace-title', templates.heading, '#astryx-heading', 'heading'],
    ['.metric, .records, .signal-card, .raw-preview', templates.card, '#astryx-card', 'card'],
    ['.topbar', templates.topNav, '#astryx-nav', 'top-nav'],
    ['.dialog', templates.dialog, '#astryx-dialog', 'dialog'],
    ['#search, .dialog-body input:not([type="checkbox"]):not([type="file"]):not([type="radio"])', templates.textInput, 'input', 'text-input'],
    ['.record-avatar', templates.avatar, '#astryx-avatar', 'avatar'],
    ['.workspace-avatar, .workspace-indicator', templates.squareAvatar, '#astryx-avatar-square', 'avatar'],
    ['.empty-state', templates.emptyState, '#astryx-empty', 'empty-state'],
    ['.records-table', templates.table, 'table', 'table'],
    ['.records-table thead', templates.table, 'thead', 'table-header'],
    ['.records-table tbody', templates.table, 'tbody', 'table-body'],
    ['.records-table thead tr', templates.table, 'thead tr', 'table-row'],
    ['.records-table tbody tr', templates.table, 'tbody tr', 'table-row'],
    ['.records-table th', templates.table, 'th', 'table-header-cell'],
    ['.records-table td', templates.table, 'td', 'table-cell'],
  ];
  for (const [target, markup, source, type] of components) {
    const rendered = specimen(markup, source);
    for (const element of container.querySelectorAll(target)) {
      if (!element.dataset.relayDesign) applyStyle(element, rendered, type);
    }
  }
  for (const button of container.querySelectorAll('button.button, button.icon-button, button.mode-button, button.view-tab')) useButton(button);
  for (const badge of container.querySelectorAll('.chip, .nav-count')) useBadge(badge);
}
