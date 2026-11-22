import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TopNav } from '@astryxdesign/core/TopNav';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import {
  ArrowDownUp, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleAlert,
  CircleCheck, Clock, Database, Download, Ellipsis, FlaskConical, Inbox,
  ListFilter, Lock, Mail, PanelLeft, Phone, Plus, Search, Settings, Table2,
  Upload, User, Users, X, Zap,
} from 'lucide-react';

const destination = new URL('./public/astryx/', import.meta.url);
const packageFile = (specifier) => new URL(import.meta.resolve(specifier));
const render = (element) => renderToStaticMarkup(h(Theme, { theme: neutralTheme, mode: 'light' }, element));
const placeholder = 'ASTRYX_CONTENT';
const iconSlot = h('span', { 'data-relay-icon': '' });
const icons = {
  search: Search, filter: ListFilter, sort: ArrowDownUp, download: Download, upload: Upload,
  'chevron-down': ChevronDown, 'chevron-right': ChevronRight, check: Check,
  'check-circle': CircleCheck, x: X, settings: Settings, users: Users, user: User,
  more: Ellipsis, mail: Mail, phone: Phone, lock: Lock, plus: Plus, clock: Clock,
  table: Table2, signal: Zap, panel: PanelLeft, 'arrow-up-right': ArrowUpRight,
  database: Database, inbox: Inbox, flask: FlaskConical, alert: CircleAlert,
};

const buttons = {};
for (const variant of ['primary', 'secondary', 'destructive', 'ghost']) {
  for (const size of ['sm', 'md']) {
    for (const content of ['label', 'icon-label', 'icon']) {
      buttons[`${variant}-${size}-${content}`] = render(h(Button, {
        label: placeholder,
        variant,
        size,
        icon: content === 'label' ? undefined : iconSlot,
        isIconOnly: content === 'icon',
      }));
    }
  }
}

const badges = {};
for (const variant of ['neutral', 'success', 'warning', 'green']) {
  badges[variant] = render(h(Badge, { variant, label: h('span', { 'data-relay-text': '' }, placeholder), icon: iconSlot }));
}

const glyphs = Object.fromEntries(Object.entries(icons).map(([key, name]) => [key, render(h(Icon, { icon: name, size: 'sm', className: 'icon relay-glyph' }))]));
const table = h(Table, { density: 'compact', id: 'astryx-table' },
  h(TableHeader, null, h(TableRow, { isHeaderRow: true }, h(TableHeaderCell, { scope: 'col' }, placeholder))),
  h(TableBody, null, h(TableRow, null, h(TableCell, null, placeholder))),
);

const templates = {
  buttons,
  badges,
  glyphs,
  heading: render(h(Heading, { level: 1, id: 'astryx-heading' }, placeholder)),
  card: render(h(Card, { padding: 0, elevation: 'none', id: 'astryx-card' }, placeholder)),
  avatar: render(h(Avatar, { name: 'Astryx Record', size: 'sm', id: 'astryx-avatar' })),
  squareAvatar: render(h(Avatar, { name: 'Relay', shape: 'rounded', size: 'sm', id: 'astryx-avatar-square' })),
  topNav: render(h(TopNav, { startContent: placeholder, id: 'astryx-nav' })),
  dialog: render(h(Dialog, { isOpen: true, id: 'astryx-dialog', width: 'min(610px, calc(100% - 30px))', onOpenChange() {} }, placeholder)),
  textInput: render(h(TextInput, { id: 'astryx-field', label: placeholder, isLabelHidden: true })),
  emptyState: render(h(EmptyState, { title: placeholder, isCompact: true, id: 'astryx-empty' })),
  table: render(table),
};

const styles = [
  '@astryxdesign/theme-neutral/fonts.css',
  '@astryxdesign/core/reset.css',
  '@astryxdesign/core/astryx.css',
  '@astryxdesign/theme-neutral/theme.css',
];
const sheets = await Promise.all(styles.map((specifier) => readFile(packageFile(specifier), 'utf8')));
await mkdir(destination, { recursive: true });
await cp(new URL('./fonts/', packageFile(styles[0])), new URL('./fonts/', destination), { recursive: true });
await writeFile(new URL('./design.css', destination), sheets.join('\n'));
await writeFile(new URL('./markup.js', destination), `export default ${JSON.stringify(templates)};\n`);
console.log('Built the Astryx component markup, Neutral theme, and local fonts.');
