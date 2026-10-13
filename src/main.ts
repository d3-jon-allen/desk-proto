import './style.css';
import {
  ATTENTION,
  KIND_LABEL,
  TODAY,
  TREATIES,
  USER_NAME,
  defaultViewState,
  dimensionValues,
  type AttentionItem,
  type ContractRow,
  type DeskTab,
  type DimFilterMap,
  type SignedLineRow,
  type StatementRow,
  type TreatyObject,
  type ViewState,
} from './data.ts';
import {
  TREATY_VIEW_CATALOG,
  activeFilterFields,
  isDateField,
  isDimension,
  recipe,
  type FieldDef,
  type ViewId,
} from './schema.ts';

type Screen = 'home' | 'case';
type ModalKind = 'settings' | null;

interface Message {
  role: 'agent' | 'user';
  body: string;
}

interface AppState {
  screen: Screen;
  caseId: string | null;
  view: ViewState | null;
  messages: Message[];
  draftOpen: boolean;
  saved: boolean;
  fullRecord: boolean;
  flash: string | null;
  compose: string;
  modal: ModalKind;
  /** Which catalog recipe is selected for column editing in settings. */
  settingsFocus: ViewId;
}

const SUGGEST_PEERS = 'How does this section look against other sections?';
const SUGGEST_LINES = 'What are my signed lines for this treaty?';
const SUGGEST_DRAFT = 'Draft a query for the residual';

function activeSuggestions(): string[] {
  const view = state.view;
  if (!view) return [SUGGEST_DRAFT];
  const out: string[] = [];
  if (!view.exploredPeers) out.push(SUGGEST_PEERS);
  else if (!view.enabledViews.has('signed-lines')) out.push(SUGGEST_LINES);
  else out.push(SUGGEST_LINES);
  out.push(SUGGEST_DRAFT);
  return out;
}

const state: AppState = {
  screen: 'home',
  caseId: null,
  view: null,
  messages: [],
  draftOpen: false,
  saved: false,
  fullRecord: false,
  flash: null,
  compose: '',
  modal: null,
  settingsFocus: 'sections',
};

const app = document.querySelector<HTMLDivElement>('#app')!;

function currentItem(): AttentionItem | null {
  return ATTENTION.find((a) => a.id === state.caseId) ?? null;
}

function currentObject(): TreatyObject | null {
  const item = currentItem();
  if (!item?.objectId) return null;
  return TREATIES[item.objectId] ?? null;
}

function openCase(item: AttentionItem): void {
  if (!item.objectId) {
    // Soft stub for non-wired cases
    state.screen = 'case';
    state.caseId = item.id;
    state.view = null;
    state.messages = [
      {
        role: 'agent',
        body: `I can open ${item.title.split(' ')[0]} as a case, but this prototype only projects a display object for TOR. Try the resolve item.`,
      },
    ];
    state.draftOpen = false;
    state.saved = false;
    render();
    return;
  }
  state.screen = 'case';
  state.caseId = item.id;
  state.view = defaultViewState(item.objectId);
  state.messages = [
    {
      role: 'agent',
      body: "I've opened the TOR case and pinned the tie-out break on the desk. The residual sits on Due for A - EU.",
    },
  ];
  state.draftOpen = false;
  state.saved = false;
  state.fullRecord = false;
  state.flash = null;
  state.modal = null;
  state.settingsFocus = 'sections';
  render();
}

function closeCase(): void {
  state.screen = 'home';
  state.caseId = null;
  state.view = null;
  state.messages = [];
  state.draftOpen = false;
  state.fullRecord = false;
  state.flash = null;
  state.modal = null;
  state.settingsFocus = 'sections';
  render();
}

function ensureDimFilter(viewId: ViewId, key: string): void {
  if (!state.view) return;
  const map = state.view.filtersByView[viewId];
  if (map[key]?.size) return;
  map[key] = new Set(dimensionValues(viewId, key, currentObject()));
}

function toggleColumn(viewId: ViewId, key: string): void {
  if (!state.view) return;
  const next = new Set(state.view.columnsByView[viewId]);
  const field = recipe(viewId).columns.find((c) => c.key === key);
  if (next.has(key)) next.delete(key);
  else {
    next.add(key);
    if (field && isDimension(field)) ensureDimFilter(viewId, key);
  }
  state.view = {
    ...state.view,
    columnsByView: { ...state.view.columnsByView, [viewId]: next },
  };
  render();
}

function toggleDimValue(viewId: ViewId, dim: string, value: string): void {
  if (!state.view) return;
  const prev = state.view.filtersByView[viewId][dim] ?? new Set<string>();
  const next = new Set(prev);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  const filtersByView = {
    ...state.view.filtersByView,
    [viewId]: { ...state.view.filtersByView[viewId], [dim]: next },
  };
  state.view = { ...state.view, filtersByView };
  render();
}

function facetAllows(filters: DimFilterMap, dim: string, value: string, columnOn: boolean): boolean {
  if (!columnOn) return true;
  const selected = filters[dim];
  if (!selected) return true;
  return selected.has(value);
}

function toggleViewEnabled(viewId: ViewId): void {
  if (!state.view) return;
  const enabled = new Set(state.view.enabledViews);
  if (enabled.has(viewId)) {
    if (enabled.size <= 1) return; // keep at least one recipe on the desk
    enabled.delete(viewId);
    // Stay on this recipe in settings (grayed); only move the desk tab if needed.
    const deskTab = enabled.has(state.view.tab)
      ? state.view.tab
      : ([...enabled][0] as ViewId);
    state.view = { ...state.view, enabledViews: enabled, tab: deskTab };
    state.settingsFocus = viewId;
  } else {
    enabled.add(viewId);
    state.view = { ...state.view, enabledViews: enabled };
    state.settingsFocus = viewId;
  }
  render();
}

function setView(patch: Partial<ViewState>, flash?: string): void {
  if (!state.view) return;
  state.view = { ...state.view, ...patch };
  state.flash = flash ?? null;
  render();
  if (flash) {
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
  }
}

function agentReply(userText: string): void {
  const q = userText.trim().toLowerCase();
  state.messages = [...state.messages, { role: 'user', body: userText.trim() }];

  if (!state.view || !currentObject()) {
    state.messages = [
      ...state.messages,
      { role: 'agent', body: 'This case has no projected display object in the prototype yet.' },
    ];
    render();
    return;
  }

  if (q.includes('other section') || q.includes('against other') || q.includes('peer')) {
    setView(
      { section: null, tab: 'sections', highlightDue: true, exploredPeers: true },
      'section',
    );
    state.messages = [
      ...state.messages,
      {
        role: 'agent',
        body: 'Cleared the section filter — all nine sections on the desk. A - EU is the only open row.',
      },
    ];
    render();
    return;
  }

  if (q.includes('signed line')) {
    const enabled = new Set(state.view.enabledViews);
    enabled.add('signed-lines');
    setView(
      {
        tab: 'signed-lines',
        section: null,
        exploredPeers: true,
        enabledViews: enabled,
      },
      'tab',
    );
    state.messages = [
      ...state.messages,
      {
        role: 'agent',
        body: "I've turned on the Signed lines view for this treaty. Switch back to Sections anytime — or use the gear to show or hide catalog views.",
      },
    ];
    render();
    return;
  }

  if (q.includes('draft') || q.includes('query')) {
    state.draftOpen = true;
    state.messages = [
      ...state.messages,
      {
        role: 'agent',
        body: 'Draft is open below the desk actions — edit it or send when ready.',
      },
    ];
    render();
    return;
  }

  if (q.includes('section') && (q.includes('a -') || q.includes('a–') || q.includes('eu'))) {
    setView({ tab: 'sections', section: 'A - EU', highlightDue: true }, 'section');
    state.messages = [
      ...state.messages,
      { role: 'agent', body: 'Scoped the sections table back to A - EU.' },
    ];
    render();
    return;
  }

  const next =
    state.view && !state.view.exploredPeers
      ? 'Try asking how this section looks against the others.'
      : state.view && !state.view.enabledViews.has('signed-lines')
        ? 'Try asking for signed lines, or draft a query.'
        : 'I change the desk rather than paste numbers here.';
  state.messages = [...state.messages, { role: 'agent', body: next }];
  render();
}

function sendCompose(): void {
  const text = state.compose.trim();
  if (!text) return;
  state.compose = '';
  if (state.screen === 'home') {
    const tor = ATTENTION.find((a) => a.id === 'tor-fix')!;
    if (text.toLowerCase().includes('tor') || text.toLowerCase().includes('tie')) {
      openCase(tor);
      return;
    }
    openCase(tor);
    state.messages = [
      ...state.messages,
      { role: 'user', body: text },
      {
        role: 'agent',
        body: 'Opened the top resolve item so we have a desk to work on. Ask about sections or signed lines.',
      },
    ];
    render();
    return;
  }
  agentReply(text);
}

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderTopnav(): string {
  return `<nav class="topnav">
    <a href="#">Marketplace</a>
    <a href="#">Community</a>
    <a href="#">Ask AI</a>
    <div class="avatars"><span class="avatar"></span><span class="avatar"></span></div>
  </nav>`;
}

function renderCompose(opts: { placeholder?: string; variant?: 'home' | 'chat' } = {}): string {
  const placeholder = opts.placeholder ?? 'Write a message…';
  const variant = opts.variant ?? 'home';
  return `<div class="compose-bar compose-bar--${variant}">
    <form class="compose-inner" data-action="compose">
      <button type="button" class="plus" aria-label="Add">+</button>
      <input name="message" type="text" placeholder="${esc(placeholder)}" value="${esc(state.compose)}" autocomplete="off" />
      <button type="submit" class="send" aria-label="Send">↑</button>
    </form>
  </div>`;
}

function renderHome(): string {
  const cards = ATTENTION.map((item) => {
    const kind = KIND_LABEL[item.kind];
    return `<button type="button" class="attention-card${kind ? '' : ' no-kind'}" data-open="${esc(item.id)}">
      ${kind ? `<span class="kind">${esc(kind)}</span>` : ''}
      <span class="attention-copy">
        <h2>${esc(item.title)}</h2>
        <p>${esc(item.detail)}</p>
      </span>
      <span class="arrow-btn" aria-hidden="true">→</span>
    </button>`;
  }).join('');

  return `${renderTopnav()}
    <main class="shell shell--home">
      <header class="home-hero">
        <h1>Good morning, ${esc(USER_NAME)}</h1>
        <div class="date">${esc(TODAY)}</div>
      </header>
      <p class="home-lead">Here are the items that need your attention today:</p>
      <div class="attention-list">${cards}</div>
    </main>
    ${renderCompose()}`;
}

function sectionCell(r: TreatyObject['sections'][0], key: string): string {
  if (key === 'section') return esc(r.section);
  if (key === 'status') return esc(r.status);
  if (key === 'itd') return esc(r.itd);
  if (key === 'previous') return esc(r.previous);
  if (key === 'due') return esc(r.due);
  return '';
}

function signedCell(r: SignedLineRow, key: string): string {
  const v = r[key as keyof SignedLineRow];
  return esc(typeof v === 'string' ? v : '—');
}

function renderColumnChecks(
  fields: FieldDef[],
  selected: Set<string>,
  viewId: ViewId,
  disabled: boolean,
): string {
  return fields
    .map(
      (f) => `<label class="check-row${disabled ? ' is-disabled' : ''}">
      <input type="checkbox" data-column-view="${esc(viewId)}" data-key="${esc(f.key)}" ${selected.has(f.key) ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
      <span>${esc(f.label)}</span>
    </label>`,
    )
    .join('');
}

function renderActiveModal(view: ViewState, obj: TreatyObject): string {
  if (state.modal !== 'settings') return '';
  const focus = state.settingsFocus;
  const focused = recipe(focus);
  const focusEnabled = view.enabledViews.has(focus);
  const tabChips = TREATY_VIEW_CATALOG.map((v) => {
    const on = view.enabledViews.has(v.id);
    const selected = focus === v.id;
    return `<div class="catalog-tab${selected ? ' selected' : ''}${on ? '' : ' is-off'}" data-settings-focus="${esc(v.id)}">
      <input type="checkbox" data-enable-view="${esc(v.id)}" ${on ? 'checked' : ''} ${on && view.enabledViews.size <= 1 ? 'disabled' : ''} aria-label="Show ${esc(v.label)} on desk" />
      <button type="button" class="catalog-tab-label" data-settings-focus="${esc(v.id)}">${esc(v.label)}</button>
    </div>`;
  }).join('');

  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-card modal-card--settings" data-stop role="dialog" aria-label="${esc(obj.label)} settings">
      <div class="modal-head">
        <h3>${esc(obj.label)}</h3>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Close">✕</button>
      </div>
      <div class="catalog-tabs">${tabChips}</div>
      <div class="settings-body${focusEnabled ? '' : ' is-disabled'}">
        <h4 class="check-group-title">Columns</h4>
        <div class="check-list">${renderColumnChecks(focused.columns, view.columnsByView[focus], focus, !focusEnabled)}</div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn primary" data-action="close-modal">Apply</button>
      </div>
    </div>
  </div>`;
}

function facetChipLabel(field: FieldDef, selected: Set<string> | undefined, all: string[]): string {
  if (!selected || selected.size === 0) return `${field.label}: None`;
  if (selected.size === all.length) return `${field.label}: All`;
  if (selected.size === 1) return `${field.label}: ${[...selected][0]}`;
  return `${field.label}: ${selected.size} of ${all.length}`;
}

function renderDimFacet(viewId: ViewId, field: FieldDef, view: ViewState, obj: TreatyObject): string {
  const all = dimensionValues(viewId, field.key, obj);
  const selected = view.filtersByView[viewId][field.key] ?? new Set(all);
  const checks = all
    .map(
      (v) => `<label class="facet-option">
      <input type="checkbox" data-facet-view="${esc(viewId)}" data-facet-dim="${esc(field.key)}" data-facet-value="${esc(v)}" ${selected.has(v) ? 'checked' : ''} />
      <span>${esc(v)}</span>
    </label>`,
    )
    .join('');
  return `<details class="facet-chip${state.flash === field.key ? ' agent-touched' : ''}">
    <summary>
      <span class="facet-chip-label">${esc(facetChipLabel(field, selected, all))}</span>
      <span class="facet-chip-caret" aria-hidden="true">▾</span>
    </summary>
    <div class="facet-menu" role="group" aria-label="${esc(field.label)} filter">${checks}</div>
  </details>`;
}

function renderDateFacet(viewId: ViewId, field: FieldDef, view: ViewState): string {
  const range = view.dateRangeByView[viewId];
  return `<div class="date-chip">
    <span class="date-chip-label">${esc(field.label)}</span>
    <input type="date" data-date-view="${esc(viewId)}" data-date-bound="from" value="${esc(range?.from ?? '')}" aria-label="${esc(field.label)} from" />
    <span class="date-chip-sep">–</span>
    <input type="date" data-date-view="${esc(viewId)}" data-date-bound="to" value="${esc(range?.to ?? '')}" aria-label="${esc(field.label)} to" />
  </div>`;
}

/** Case pin for sections — keeps the focused single-select alongside derived facets. */
function renderSectionPin(obj: TreatyObject, view: ViewState): string {
  if (!view.columnsByView.sections.has('section')) return '';
  const sectionLabel = view.section
    ? `Section: ${view.section.replace(' - ', ' – ')}`
    : 'Section: All';
  const options = [
    `<option value="">All sections</option>`,
    ...obj.sections.map(
      (s) =>
        `<option value="${esc(s.section)}"${view.section === s.section ? ' selected' : ''}>${esc(s.section)}</option>`,
    ),
  ].join('');
  return `<label class="section-chip${state.flash === 'section' ? ' agent-touched' : ''}">
    <span class="section-chip-label">${esc(sectionLabel)}</span>
    <span class="section-chip-caret" aria-hidden="true">▾</span>
    <select data-action="section" aria-label="Section focus">${options}</select>
  </label>`;
}

function renderFilterToolbar(viewId: ViewId, view: ViewState, obj: TreatyObject): string {
  const fields = activeFilterFields(viewId, view.columnsByView[viewId]);
  const parts: string[] = [];
  if (viewId === 'sections') {
    const pin = renderSectionPin(obj, view);
    if (pin) parts.push(pin);
  }
  for (const field of fields) {
    // Section focus chip already covers case pin; skip section multi-facet on sections tab.
    if (viewId === 'sections' && field.key === 'section') continue;
    if (isDateField(field)) parts.push(renderDateFacet(viewId, field, view));
    else if (isDimension(field)) parts.push(renderDimFacet(viewId, field, view, obj));
  }
  if (parts.length === 0) return '';
  return `<div class="table-toolbar">${parts.join('')}</div>`;
}

function renderSectionsTable(obj: TreatyObject, view: ViewState): string {
  const colDefs = recipe('sections').columns;
  const cols = colDefs.filter((c) => view.columnsByView.sections.has(c.key));
  const filters = view.filtersByView.sections;
  const statusCol = view.columnsByView.sections.has('status');
  const rows = obj.sections.filter((r) => {
    if (view.section && r.section !== view.section) return false;
    return facetAllows(filters, 'status', r.status, statusCol);
  });

  const body =
    rows.length === 0
      ? `<tr><td colspan="${Math.max(cols.length, 1)}" class="empty-cell">No sections match these filters.</td></tr>`
      : rows
          .map(
            (r) => `<tr class="${r.status === 'Open' ? 'open' : ''}">
      ${cols
        .map((c) => {
          const em = c.key === 'due' && r.dueEmphasis && view.highlightDue ? ' class="em"' : '';
          return `<td${em}>${sectionCell(r, c.key)}</td>`;
        })
        .join('')}
    </tr>`,
          )
          .join('');

  return `${renderFilterToolbar('sections', view, obj)}
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function contractCell(r: ContractRow, key: string): string {
  return esc(r[key as keyof ContractRow] ?? '');
}

function statementCell(r: StatementRow, key: string): string {
  if (key === 'dateIso') return esc(r.date);
  return esc(r[key as keyof StatementRow] ?? '');
}

function renderContracts(obj: TreatyObject, view: ViewState): string {
  const colDefs = recipe('contracts').columns;
  const cols = colDefs.filter((c) => view.columnsByView.contracts.has(c.key));
  const filters = view.filtersByView.contracts;
  const visible = view.columnsByView.contracts;
  const rows = obj.contracts.filter((r) => {
    if (!facetAllows(filters, 'reinsured', r.reinsured, visible.has('reinsured'))) return false;
    if (!facetAllows(filters, 'section', r.section, visible.has('section'))) return false;
    if (!facetAllows(filters, 'currency', r.currency, visible.has('currency'))) return false;
    return true;
  });

  const body =
    rows.length === 0
      ? `<tr><td colspan="${Math.max(cols.length, 1)}" class="empty-cell">No contracts match these filters.</td></tr>`
      : rows
          .map(
            (r) => `<tr>${cols.map((c) => `<td>${contractCell(r, c.key)}</td>`).join('')}</tr>`,
          )
          .join('');

  return `${renderFilterToolbar('contracts', view, obj)}
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function inDateRange(iso: string, range: { from: string; to: string } | null): boolean {
  if (!range) return true;
  if (range.from && iso < range.from) return false;
  if (range.to && iso > range.to) return false;
  return true;
}

function renderStatements(obj: TreatyObject, view: ViewState): string {
  const colDefs = recipe('statements').columns;
  const cols = colDefs.filter((c) => view.columnsByView.statements.has(c.key));
  const filters = view.filtersByView.statements;
  const visible = view.columnsByView.statements;
  const range = visible.has('date') ? view.dateRangeByView.statements : null;
  const rows = obj.statements.filter((r) => {
    if (!facetAllows(filters, 'type', r.type, visible.has('type'))) return false;
    if (!facetAllows(filters, 'section', r.section, visible.has('section'))) return false;
    if (!facetAllows(filters, 'currency', r.currency, visible.has('currency'))) return false;
    if (
      r.premiumBasis !== '—' &&
      !facetAllows(filters, 'premiumBasis', r.premiumBasis, visible.has('premiumBasis'))
    ) {
      return false;
    }
    if (!facetAllows(filters, 'status', r.status, visible.has('status'))) return false;
    if (!inDateRange(r.dateIso, range)) return false;
    return true;
  });

  const body =
    rows.length === 0
      ? `<tr><td colspan="${Math.max(cols.length, 1)}" class="empty-cell">No statements match these filters.</td></tr>`
      : rows
          .map(
            (r) => `<tr>${cols.map((c) => `<td>${statementCell(r, c.key)}</td>`).join('')}</tr>`,
          )
          .join('');

  return `${renderFilterToolbar('statements', view, obj)}
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderSignedLines(obj: TreatyObject, view: ViewState): string {
  const colDefs = recipe('signed-lines').columns;
  const cols = colDefs.filter((c) => view.columnsByView['signed-lines'].has(c.key));
  const filters = view.filtersByView['signed-lines'];
  const visible = view.columnsByView['signed-lines'];
  const rows = obj.signedLines.filter((r) => {
    if (!facetAllows(filters, 'section', r.section, visible.has('section'))) return false;
    if (!facetAllows(filters, 'entity', r.entity, visible.has('entity'))) return false;
    if (!facetAllows(filters, 'commType', r.commType, visible.has('commType'))) return false;
    return true;
  });

  const body =
    rows.length === 0
      ? `<tr><td colspan="${Math.max(cols.length, 1)}" class="empty-cell">No signed lines match these filters.</td></tr>`
      : rows
          .map(
            (r) => `<tr>
      ${cols.map((c) => `<td>${signedCell(r, c.key)}</td>`).join('')}
    </tr>`,
          )
          .join('');

  return `${renderFilterToolbar('signed-lines', view, obj)}
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}
function renderDisplayObject(obj: TreatyObject, view: ViewState): string {
  const tab = view.tab;
  return `<section class="display-object${state.flash === 'tab' ? ' agent-touched' : ''}">
    <div class="display-head">
      <div>
        <h3>${esc(obj.label)}</h3>
        <div class="pills">
          <span class="pill">Signed line (blended) ${esc(obj.signedLineBlended)}</span>
          <span class="pill">Settlement: ${esc(obj.settlement)}</span>
          <span class="pill">${esc(obj.period)}</span>
        </div>
      </div>
      <button type="button" class="icon-btn" data-action="open-settings" aria-label="Table settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.65 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.13.23.4.32.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.09.48 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>
        </svg>
      </button>
    </div>
    <div class="residual">
      <strong>${esc(obj.residualNote)}</strong>
      <span class="scale">${esc(obj.residualScale)}</span>
    </div>
    ${
      view.enabledViews.size > 1
        ? `<div class="view-tabs" role="tablist">
      ${TREATY_VIEW_CATALOG.filter((v) => view.enabledViews.has(v.id))
        .map(
          (v) =>
            `<button type="button" role="tab" class="view-tab${tab === v.id ? ' active' : ''}" data-tab="${esc(v.id)}" aria-selected="${tab === v.id}">${esc(v.label)}</button>`,
        )
        .join('')}
    </div>`
        : ''
    }
    ${
      tab === 'sections'
        ? renderSectionsTable(obj, view)
        : tab === 'signed-lines'
          ? renderSignedLines(obj, view)
          : tab === 'contracts'
            ? renderContracts(obj, view)
            : renderStatements(obj, view)
    }
  </section>`;
}

function renderThread(): string {
  const msgs = state.messages
    .map((m) => `<div class="bubble ${m.role}">${esc(m.body)}</div>`)
    .join('');

  const used = new Set(
    state.messages.filter((m) => m.role === 'user').map((m) => m.body.toLowerCase()),
  );
  const suggestions = activeSuggestions()
    .filter((s) => !used.has(s.toLowerCase()))
    .map((s) => `<button type="button" class="suggestion" data-suggest="${esc(s)}">${esc(s)}</button>`)
    .join('');

  return `<aside class="chat">
    <div class="chat-panel">
      <div class="thread-messages">${msgs}</div>
      ${suggestions ? `<div class="suggestions">${suggestions}</div>` : ''}
    </div>
    ${renderCompose({ variant: 'chat' })}
  </aside>`;
}

function renderCase(): string {
  const item = currentItem();
  const obj = currentObject();
  if (!item) return renderHome();

  const deskBody =
    obj && state.view
      ? renderDisplayObject(obj, state.view)
      : `<section class="display-object"><p class="residual">No projected display object for this item in the prototype.</p></section>`;

  const draft = state.draftOpen
    ? `<div class="display-object">
        <strong>Draft query</strong>
        <textarea style="width:100%;min-height:7rem;margin-top:0.5rem;background:#111;border:1px solid var(--border);border-radius:0.5rem;color:var(--text);padding:0.75rem;font:inherit">Please review the €40,000 residual on Due for section A - EU on the Q1 2026 statement. Internal tie-out does not reconcile within tolerance (€1). Kindly confirm or provide a corrected bordereaux.</textarea>
        <div class="case-actions">
          <button type="button" class="btn primary" data-action="send-draft">Send</button>
          <button type="button" class="btn" data-action="cancel-draft">Cancel</button>
        </div>
      </div>`
    : '';

  const full = state.fullRecord
    ? `<div class="full-record" data-action="close-full">
        <div class="full-record-card" data-stop>
          <h2>${esc(obj?.label ?? 'Record')}</h2>
          <p>Canonical host for this data object — same tabs and tables, full chrome. In product this would be the reinsurer detail route, scoped to the case’s treaty year.</p>
          <ul>
            <li>Sections · Signed lines · Statement · Controls</li>
            <li>Desk view state can deep-link here (tab, section filter)</li>
            <li>Escape from the projected instance, not a different object</li>
          </ul>
          <button type="button" class="btn primary" data-action="close-full">Back to case desk</button>
        </div>
      </div>`
    : '';

  return `<div class="case-page">${renderTopnav()}
    <main class="case-body">
      <div class="desk-stage">
        <section class="desk" aria-label="Desk">
          <button type="button" class="all-issues" data-action="home">← All issues</button>
          <div class="desk-scroll">
            <div class="case-banner">
              <span class="kind">${esc(KIND_LABEL[item.kind] || 'Case')}</span>
              <div class="case-banner-copy">
                <h2>${esc(item.title)}</h2>
                <span class="meta">${esc(item.detail)}</span>
              </div>
            </div>
            ${deskBody}
            ${draft}
          </div>
          <div class="case-actions">
            <button type="button" class="btn primary" data-action="draft">Draft query</button>
            <button type="button" class="btn" data-action="full-record">View full statement</button>
            <button type="button" class="btn" data-action="save">${state.saved ? 'Saved' : 'Save case'}</button>
          </div>
        </section>
      </div>
    </main>
    ${renderThread()}
    ${state.view && obj ? renderActiveModal(state.view, obj) : ''}
    ${full}
  </div>`;
}

function render(): void {
  app.innerHTML = state.screen === 'home' ? renderHome() : renderCase();
  bind();
}

function bind(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = ATTENTION.find((a) => a.id === btn.dataset.open);
      if (item) openCase(item);
    });
  });

  app.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    const action = el.dataset.action!;
    if (action === 'compose' && el instanceof HTMLFormElement) {
      el.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = el.querySelector('input');
        state.compose = input?.value ?? '';
        sendCompose();
      });
      const input = el.querySelector('input');
      input?.addEventListener('input', () => {
        state.compose = input.value;
      });
      return;
    }
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (action === 'close-modal') {
        // Only the backdrop / explicit close controls dismiss — not bubbled card clicks.
        if (el.hasAttribute('data-stop')) return;
        if (target.closest('[data-stop]') && target.closest('[data-action="close-modal"]') !== el) {
          return;
        }
        if (el.classList.contains('modal-backdrop') && target !== el) return;
        state.modal = null;
        render();
        return;
      }
      if (action === 'open-settings') {
        state.modal = 'settings';
        if (state.view) state.settingsFocus = state.view.tab;
        render();
        return;
      }
      if (action === 'home') closeCase();
      if (action === 'full-record') {
        state.fullRecord = true;
        render();
      }
      if (action === 'close-full') {
        if (target.closest('[data-stop]') && !target.closest('[data-action="close-full"]')) return;
        state.fullRecord = false;
        render();
      }
      if (action === 'draft') {
        state.draftOpen = true;
        render();
      }
      if (action === 'cancel-draft') {
        state.draftOpen = false;
        render();
      }
      if (action === 'send-draft') {
        state.draftOpen = false;
        state.messages = [
          ...state.messages,
          { role: 'user', body: 'Sent the query draft.' },
          {
            role: 'agent',
            body: 'Marked under query. The case stays on the desk until a corrected statement re-lands, or you resolve with an outcome.',
          },
        ];
        render();
      }
      if (action === 'save') {
        state.saved = true;
        render();
      }
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setView({ tab: btn.dataset.tab as DeskTab });
    });
  });

  const sectionSelect = app.querySelector<HTMLSelectElement>('[data-action="section"]');
  sectionSelect?.addEventListener('change', () => {
    setView({ section: sectionSelect.value || null });
  });

  app.querySelectorAll<HTMLInputElement>('[data-facet-view]').forEach((input) => {
    input.addEventListener('change', () => {
      toggleDimValue(
        input.dataset.facetView as ViewId,
        input.dataset.facetDim!,
        input.dataset.facetValue!,
      );
    });
  });

  app.querySelectorAll<HTMLInputElement>('[data-date-view]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!state.view) return;
      const viewId = input.dataset.dateView as ViewId;
      const bound = input.dataset.dateBound as 'from' | 'to';
      const prev = state.view.dateRangeByView[viewId] ?? { from: '', to: '' };
      const next = { ...prev, [bound]: input.value };
      state.view = {
        ...state.view,
        dateRangeByView: { ...state.view.dateRangeByView, [viewId]: next },
      };
      render();
    });
  });

  app.querySelectorAll<HTMLInputElement>('[data-column-view]').forEach((input) => {
    input.addEventListener('change', () => {
      toggleColumn(input.dataset.columnView as ViewId, input.dataset.key!);
    });
  });

  app.querySelectorAll<HTMLInputElement>('[data-enable-view]').forEach((input) => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleViewEnabled(input.dataset.enableView as ViewId);
    });
  });

  app.querySelectorAll<HTMLElement>('[data-settings-focus]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('input[data-enable-view]')) return;
      const id = el.dataset.settingsFocus as ViewId;
      if (state.settingsFocus === id) return;
      state.settingsFocus = id;
      render();
    });
  });

  app.querySelector('.modal-card')?.addEventListener('click', (e) => e.stopPropagation());

  app.querySelectorAll<HTMLButtonElement>('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      agentReply(btn.dataset.suggest!);
    });
  });
}

render();
