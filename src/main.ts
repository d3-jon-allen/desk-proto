import './style.css';
import {
  ATTENTION,
  KIND_LABEL,
  TODAY,
  TREATIES,
  USER_NAME,
  defaultViewState,
  dimensionValues,
  sortAttention,
  thresholdAllows,
  type AttentionItem,
  type AttentionSort,
  type ContractRow,
  type DeskTab,
  type DimFilterMap,
  type MeasureThreshold,
  type SignedLineRow,
  type StatementRow,
  type TreatyObject,
  type ViewState,
} from './data.ts';
import {
  INSIGHT_RESIDUAL_ID,
  cloneViewForTab,
  createSectionObject,
  createTableObject,
  residualInsightPeers,
  residualInsightTor,
  type DeskLayout,
  type DeskObject,
  type DeskOp,
  type InsightDeskObject,
  type SectionDeskObject,
  type TableDeskObject,
} from './desk.ts';
import { renderInsightWidget } from './insight-render.ts';
import { renderSectionObject } from './section-render.ts';
import {
  TREATY_VIEW_CATALOG,
  activeFilterFields,
  isDateField,
  isDimension,
  recipe,
  type FieldDef,
  type FieldRole,
  type ViewId,
} from './schema.ts';
import { esc } from './util.ts';

type Screen = 'home' | 'case';
type ModalKind = 'settings' | 'confirm-remove' | null;

type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'chip'; label: string; value: string; apply?: DeskOp };

interface Message {
  role: 'agent' | 'user';
  parts: MessagePart[];
}

interface AppState {
  screen: Screen;
  caseId: string | null;
  desk: DeskObject[];
  layout: DeskLayout;
  /** Table object targeted by settings / mutations. */
  focusTableId: string | null;
  messages: Message[];
  draftOpen: boolean;
  saved: boolean;
  fullRecord: boolean;
  flash: string | null;
  compose: string;
  modal: ModalKind;
  settingsFocus: ViewId;
  settingsQuery: string;
  /** Typeahead list open (Slack-style: show on focus). */
  settingsSearchOpen: boolean;
  /** Panel pending removal confirmation. */
  pendingRemoveId: string | null;
  chatCollapsed: boolean;
  homeSort: AttentionSort;
  /** Open chip action menu in the thread (msg index + part index). */
  chipMenu: { msg: number; part: number } | null;
  demo: {
    sawResidualPct: boolean;
    sawCompare: boolean;
    sawSplit: boolean;
    sawEmpty: boolean;
    sawThreshold: boolean;
  };
}

const SUGGEST_RESIDUAL_PCT = 'What % of section ITD is the residual?';
const SUGGEST_COMPARE = 'How does this residual compare to Allianz?';
const SUGGEST_SPLIT = 'Show signed lines and contracts side by side';
const SUGGEST_EMPTY = 'Only open sections that aren’t A - EU';
const SUGGEST_THRESHOLD = 'Show contracts with loss ratio over 10%';
const SUGGEST_JUST_TELL = 'Don’t change the desk — just tell me the residual %';
const SUGGEST_PEERS = 'How does this section look against other sections?';
const SUGGEST_DRAFT = 'Draft a query for the residual';

function msg(role: Message['role'], text: string, chips: MessagePart[] = []): Message {
  return { role, parts: [{ type: 'text', text }, ...chips] };
}

function userText(m: Message): string {
  return m.parts
    .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
}

function activeSuggestions(): string[] {
  if (!caseTreatyId()) return [SUGGEST_DRAFT];
  const d = state.demo;
  const out: string[] = [];
  if (!d.sawResidualPct) out.push(SUGGEST_RESIDUAL_PCT);
  else if (!d.sawCompare) out.push(SUGGEST_COMPARE);
  else if (!d.sawSplit) out.push(SUGGEST_SPLIT);
  else if (!d.sawEmpty) out.push(SUGGEST_EMPTY);
  else if (!d.sawThreshold) out.push(SUGGEST_THRESHOLD);
  else {
    out.push(SUGGEST_JUST_TELL);
    out.push(SUGGEST_PEERS);
    out.push(SUGGEST_DRAFT);
  }
  return out;
}

const state: AppState = {
  screen: 'home',
  caseId: null,
  desk: [],
  layout: 'stack',
  focusTableId: null,
  messages: [],
  draftOpen: false,
  saved: false,
  fullRecord: false,
  flash: null,
  compose: '',
  modal: null,
  settingsFocus: 'sections',
  settingsQuery: '',
  settingsSearchOpen: false,
  pendingRemoveId: null,
  chatCollapsed: false,
  homeSort: 'urgency',
  chipMenu: null,
  demo: {
    sawResidualPct: false,
    sawCompare: false,
    sawSplit: false,
    sawEmpty: false,
    sawThreshold: false,
  },
};

function iconPanelSidebar(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2"/>
    <path d="M15.5 4.5v15"/>
  </svg>`;
}

function iconSortUrgency(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 7h10"/>
    <path d="M4 12h7"/>
    <path d="M4 17h4"/>
    <path d="M17 6v12"/>
    <path d="M14 15l3 3 3-3"/>
  </svg>`;
}

function iconSortDate(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8"/>
    <path d="M12 8v4.5l2.5 1.5"/>
  </svg>`;
}


const app = document.querySelector<HTMLDivElement>('#app')!;

function currentItem(): AttentionItem | null {
  return ATTENTION.find((a) => a.id === state.caseId) ?? null;
}

function primaryTable(): TableDeskObject | null {
  const focused = state.desk.find(
    (o): o is TableDeskObject => o.kind === 'table' && o.id === state.focusTableId,
  );
  if (focused) return focused;
  return state.desk.find((o): o is TableDeskObject => o.kind === 'table' && !o.title) ?? null;
}

function primarySection(): SectionDeskObject | null {
  return state.desk.find((o): o is SectionDeskObject => o.kind === 'section') ?? null;
}

function caseTreatyId(): string | null {
  return primaryTable()?.treatyId ?? primarySection()?.treatyId ?? null;
}

function tableById(id: string | undefined): TableDeskObject | null {
  if (!id) return primaryTable();
  return state.desk.find((o): o is TableDeskObject => o.kind === 'table' && o.id === id) ?? null;
}

function treatyFor(table: TableDeskObject): TreatyObject | null {
  return TREATIES[table.treatyId] ?? null;
}

/** Swap the treaty collection frame for a single-section focus card. */
function focusSectionOnDesk(
  treatyId: string,
  section: string,
  opts?: { highlightDue?: boolean },
): SectionDeskObject {
  const sectionObj = createSectionObject(treatyId, section, {
    highlightDue: opts?.highlightDue ?? true,
  });
  const insights = state.desk.filter((o): o is InsightDeskObject => o.kind === 'insight');
  const panes = state.desk.filter((o): o is TableDeskObject => o.kind === 'table' && !!o.title);
  state.desk = [sectionObj, ...insights, ...panes];
  state.focusTableId = null;
  return sectionObj;
}

/** Promote section focus back to the treaty table (collection view). */
function expandToTreatyTable(
  treatyId: string,
  viewPatch?: Partial<ViewState>,
): TableDeskObject {
  const existing = primaryTable();
  if (existing) {
    if (viewPatch) patchTable(existing.id, { view: { ...existing.view, ...viewPatch } });
    state.desk = state.desk.filter((o) => o.kind !== 'section');
    state.focusTableId = existing.id;
    return existing;
  }
  const base = defaultViewState(treatyId);
  const table = createTableObject(treatyId, {
    view: viewPatch ? { ...base, ...viewPatch } : base,
  });
  const insights = state.desk.filter((o): o is InsightDeskObject => o.kind === 'insight');
  const panes = state.desk.filter((o): o is TableDeskObject => o.kind === 'table' && !!o.title);
  state.desk = [table, ...insights, ...panes];
  state.focusTableId = table.id;
  return table;
}

/** Table for agent intents — expands section focus when the op needs a collection. */
function requireTreatyTable(viewPatch?: Partial<ViewState>): TableDeskObject | null {
  const tid = caseTreatyId();
  if (!tid) return null;
  if (primaryTable()) {
    const t = primaryTable()!;
    if (viewPatch) patchTable(t.id, { view: { ...t.view, ...viewPatch } });
    return t;
  }
  return expandToTreatyTable(tid, viewPatch);
}

function patchTable(tableId: string, patch: Partial<TableDeskObject>): void {
  state.desk = state.desk.map((o) =>
    o.kind === 'table' && o.id === tableId ? { ...o, ...patch, view: patch.view ?? o.view } : o,
  );
}

function patchTableView(tableId: string | undefined, viewPatch: Partial<ViewState>, flash?: string): void {
  const table = tableById(tableId);
  if (!table) return;
  patchTable(table.id, { view: { ...table.view, ...viewPatch } });
  state.focusTableId = table.id;
  state.flash = flash ?? null;
  render();
  if (flash) {
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
  }
}

function placeInsightOnDesk(insight: InsightDeskObject): void {
  // Drop legacy math/compare ids if any linger from older sessions in memory.
  const rest = state.desk.filter(
    (o) =>
      o.id !== insight.id &&
      o.id !== 'math-residual-pct' &&
      o.id !== 'compare-residual',
  );
  const primaryIdx = rest.findIndex(
    (o) => o.kind === 'section' || (o.kind === 'table' && !o.title),
  );
  if (primaryIdx === -1) {
    state.desk = [...rest, insight];
    return;
  }
  state.desk = [...rest.slice(0, primaryIdx + 1), insight, ...rest.slice(primaryIdx + 1)];
}

function applyDeskOp(op: DeskOp): void {
  if (op.type === 'focus-section') {
    focusSectionOnDesk(op.treatyId, op.section, { highlightDue: op.highlightDue ?? true });
    state.flash = 'residual';
    render();
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
    return;
  }

  if (op.type === 'highlight-residual') {
    const tid = tableById(op.tableId)?.treatyId ?? caseTreatyId();
    if (!tid) return;
    focusSectionOnDesk(tid, 'A - EU', { highlightDue: true });
    state.flash = 'residual';
    render();
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
    return;
  }

  if (op.type === 'show-residual-insight') {
    const tid = tableById(op.tableId)?.treatyId ?? caseTreatyId();
    if (!tid) return;
    const existing = state.desk.find(
      (o): o is InsightDeskObject => o.kind === 'insight' && o.id === INSIGHT_RESIDUAL_ID,
    );
    const next =
      op.peers || (existing && existing.subjects.length > 1)
        ? residualInsightPeers()
        : residualInsightTor();
    if (op.peers) {
      expandToTreatyTable(tid, {
        tab: 'sections',
        highlightDue: true,
        section: null,
        exploredPeers: true,
      });
    } else {
      focusSectionOnDesk(tid, 'A - EU', { highlightDue: true });
    }
    placeInsightOnDesk(next);
    state.chipMenu = null;
    state.flash = 'residual';
    render();
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
    return;
  }

  const table = tableById(op.tableId) ?? requireTreatyTable();
  if (!table) return;
  const obj = treatyFor(table);
  if (op.type === 'clear-filters' || op.type === 'show-all') {
    if (!obj) return;
    const filtersByView = { ...table.view.filtersByView };
    for (const viewId of Object.keys(filtersByView) as ViewId[]) {
      const dims = filtersByView[viewId];
      const next: DimFilterMap = {};
      for (const key of Object.keys(dims)) {
        next[key] = new Set(dimensionValues(viewId, key, obj));
      }
      filtersByView[viewId] = next;
    }
    const clearedThresholds = { ...table.view.thresholdsByView };
    for (const k of Object.keys(clearedThresholds) as ViewId[]) {
      clearedThresholds[k] = [];
    }
    patchTableView(table.id, {
      section: null,
      filtersByView,
      thresholdsByView: clearedThresholds,
    });
    return;
  }
  if (op.type === 'set-threshold') {
    const list = [...(table.view.thresholdsByView[op.viewId] ?? [])].filter((t) => t.key !== op.key);
    list.push({ key: op.key, op: op.op, value: op.value });
    const enabled = new Set(table.view.enabledViews);
    enabled.add(op.viewId);
    const cols = new Set(table.view.columnsByView[op.viewId]);
    cols.add(op.key);
    patchTableView(table.id, {
      tab: op.viewId,
      enabledViews: enabled,
      columnsByView: { ...table.view.columnsByView, [op.viewId]: cols },
      thresholdsByView: { ...table.view.thresholdsByView, [op.viewId]: list },
      exploredPeers: true,
    }, 'threshold');
  }
}

function openCase(item: AttentionItem): void {
  if (!item.objectId) {
    state.screen = 'case';
    state.caseId = item.id;
    state.desk = [];
    state.focusTableId = null;
    state.messages = [
      msg(
        'agent',
        `I can open ${item.title.split(' ')[0]} as a case, but this prototype only projects a display object for TOR. Try the resolve item.`,
      ),
    ];
    state.draftOpen = false;
    state.saved = false;
    render();
    return;
  }
  const table = createTableObject(item.objectId);
  state.screen = 'case';
  state.caseId = item.id;
  state.desk = [table];
  state.layout = 'stack';
  state.focusTableId = table.id;
  state.messages = [
    msg(
      'agent',
      "I've opened the TOR case and pinned the tie-out break on the desk. The residual sits on Due for A - EU.",
    ),
  ];
  state.draftOpen = false;
  state.saved = false;
  state.fullRecord = false;
  state.flash = null;
  state.modal = null;
  state.settingsFocus = 'sections';
  state.settingsQuery = '';
  state.settingsSearchOpen = false;
  state.pendingRemoveId = null;
  state.chatCollapsed = false;
  state.chipMenu = null;
  state.demo = {
    sawResidualPct: false,
    sawCompare: false,
    sawSplit: false,
    sawEmpty: false,
    sawThreshold: false,
  };
  render();
}

function closeCase(): void {
  state.screen = 'home';
  state.caseId = null;
  state.desk = [];
  state.focusTableId = null;
  state.layout = 'stack';
  state.messages = [];
  state.draftOpen = false;
  state.fullRecord = false;
  state.flash = null;
  state.modal = null;
  state.settingsFocus = 'sections';
  state.settingsQuery = '';
  state.settingsSearchOpen = false;
  state.pendingRemoveId = null;
  state.chatCollapsed = false;
  state.chipMenu = null;
  render();
}

function tableCount(): number {
  return state.desk.filter((o) => o.kind === 'table').length;
}

function mainObjectCount(): number {
  return state.desk.filter(
    (o) => o.kind === 'section' || (o.kind === 'table' && !o.title) || o.kind === 'insight',
  ).length;
}

function requestRemovePanel(objectId: string): void {
  const target = state.desk.find((o) => o.id === objectId);
  if (!target) return;
  if (target.kind === 'table' && !target.title && tableCount() <= 1 && !primarySection()) return;
  if (target.kind === 'section' && mainObjectCount() <= 1) return;
  state.pendingRemoveId = objectId;
  state.modal = 'confirm-remove';
  render();
}

function confirmRemovePanel(): void {
  const id = state.pendingRemoveId;
  const target = id ? state.desk.find((o) => o.id === id) : null;
  const blocked =
    !id ||
    !target ||
    (target.kind === 'table' && !target.title && tableCount() <= 1 && !primarySection()) ||
    (target.kind === 'section' && mainObjectCount() <= 1);
  if (blocked) {
    state.modal = null;
    state.pendingRemoveId = null;
    render();
    return;
  }
  state.desk = state.desk.filter((o) => o.id !== id);
  if (state.focusTableId === id) {
    state.focusTableId = primaryTable()?.id ?? null;
  }
  const panes = state.desk.filter((o) => o.kind === 'table' && o.title);
  state.layout = panes.length >= 2 ? 'split' : 'stack';
  state.modal = null;
  state.pendingRemoveId = null;
  render();
}

function ensureDimFilter(table: TableDeskObject, viewId: ViewId, key: string): ViewState {
  const map = { ...table.view.filtersByView[viewId] };
  if (!map[key]?.size) {
    map[key] = new Set(dimensionValues(viewId, key, treatyFor(table)));
  }
  return {
    ...table.view,
    filtersByView: { ...table.view.filtersByView, [viewId]: map },
  };
}

function toggleColumn(viewId: ViewId, key: string): void {
  const table = primaryTable();
  if (!table) return;
  const next = new Set(table.view.columnsByView[viewId]);
  const field = recipe(viewId).columns.find((c) => c.key === key);
  let view = table.view;
  if (next.has(key)) next.delete(key);
  else {
    next.add(key);
    if (field && isDimension(field)) view = ensureDimFilter({ ...table, view }, viewId, key);
  }
  patchTableView(table.id, {
    ...view,
    columnsByView: { ...view.columnsByView, [viewId]: next },
  });
}

function toggleDimValue(viewId: ViewId, dim: string, value: string): void {
  const table = primaryTable();
  if (!table) return;
  const prev = table.view.filtersByView[viewId][dim] ?? new Set<string>();
  const next = new Set(prev);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  patchTableView(table.id, {
    filtersByView: {
      ...table.view.filtersByView,
      [viewId]: { ...table.view.filtersByView[viewId], [dim]: next },
    },
  });
}

function toggleViewEnabled(viewId: ViewId): void {
  const table = primaryTable();
  if (!table) return;
  const enabled = new Set(table.view.enabledViews);
  if (enabled.has(viewId)) {
    if (enabled.size <= 1) return;
    enabled.delete(viewId);
    const deskTab = enabled.has(table.view.tab) ? table.view.tab : ([...enabled][0] as ViewId);
    patchTableView(table.id, { enabledViews: enabled, tab: deskTab });
    state.settingsFocus = viewId;
  } else {
    enabled.add(viewId);
    patchTableView(table.id, { enabledViews: enabled });
    state.settingsFocus = viewId;
  }
}

function facetAllows(filters: DimFilterMap, dim: string, value: string, columnOn: boolean): boolean {
  if (!columnOn) return true;
  const selected = filters[dim];
  if (!selected) return true;
  return selected.has(value);
}

function agentReply(userTextIn: string): void {
  const q = userTextIn.trim().toLowerCase();
  state.messages = [...state.messages, msg('user', userTextIn.trim())];
  const tid = caseTreatyId();

  if (!tid || !TREATIES[tid]) {
    state.messages = [
      ...state.messages,
      msg('agent', 'This case has no projected display object in the prototype yet.'),
    ];
    render();
    return;
  }

  const residualChip: MessagePart = {
    type: 'chip',
    label: 'Residual / section ITD',
    value: '3.2%',
    apply: { type: 'show-residual-insight', tableId: primaryTable()?.id },
  };

  if (
    (q.includes('just tell') || q.includes("don't change") || q.includes('don’t change')) &&
    (q.includes('residual') || q.includes('%') || q.includes('percent'))
  ) {
    state.demo.sawResidualPct = true;
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        '3.2% of A – EU section ITD (€40K / €1.24M). Desk unchanged — open the readout to pin it.',
        [residualChip],
      ),
    ];
    render();
    return;
  }

  if (
    (q.includes('residual') && (q.includes('%') || q.includes('percent') || q.includes('itd'))) ||
    q.includes('what % of section')
  ) {
    state.demo.sawResidualPct = true;
    applyDeskOp({ type: 'focus-section', treatyId: tid, section: 'A - EU', highlightDue: true });
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'Focused the desk on section A – EU — treaty context is on the tags. Open the readout to pin Residual / ITD.',
        [residualChip],
      ),
    ];
    render();
    return;
  }

  if (q.includes('compare') && q.includes('allianz')) {
    state.demo.sawCompare = true;
    applyDeskOp({ type: 'show-residual-insight', tableId: primaryTable()?.id, peers: true });
    state.messages = [
      ...state.messages,
      msg('agent', 'Pinned TOR and Allianz side by side on the desk.'),
    ];
    render();
    return;
  }

  if (
    (q.includes('signed line') && q.includes('contract')) ||
    q.includes('side by side')
  ) {
    state.demo.sawSplit = true;
    const table = requireTreatyTable()!;
    const base = table.view;
    const lines = createTableObject(table.treatyId, {
      id: 'table-signed-lines',
      title: 'Signed lines',
      view: cloneViewForTab(base, 'signed-lines'),
    });
    const contracts = createTableObject(table.treatyId, {
      id: 'table-contracts',
      title: 'Contracts',
      view: cloneViewForTab(base, 'contracts'),
    });
    // Keep primary object (section or treaty); add panes below.
    const keep = state.desk.filter(
      (o) => o.id !== 'table-signed-lines' && o.id !== 'table-contracts',
    );
    state.desk = [...keep, lines, contracts];
    state.layout = 'split';
    state.focusTableId = lines.id;
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'Kept your focus object and opened Signed lines and Contracts beside each other below. Remove any pane with ✕ next to the gear.',
      ),
    ];
    render();
    return;
  }

  if (
    (q.includes('open') && (q.includes("aren't") || q.includes('aren’t') || q.includes('not'))) ||
    (q.includes('only open') && q.includes('a -'))
  ) {
    state.demo.sawEmpty = true;
    const table = requireTreatyTable()!;
    // Open-only + pin to a tied section → empty set (demo for recovery actions).
    patchTableView(table.id, {
      tab: 'sections',
      section: 'B - UK',
      filtersByView: {
        ...table.view.filtersByView,
        sections: { ...table.view.filtersByView.sections, status: new Set(['Open']) },
      },
      exploredPeers: true,
    });
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'Filtered to Open sections excluding A - EU — that set is empty. Use the empty-state actions to recover.',
      ),
    ];
    render();
    return;
  }

  if (
    (q.includes('loss ratio') || q.includes('lr ')) &&
    (q.includes('over') || q.includes('>') || q.includes('above') || q.includes('10'))
  ) {
    state.demo.sawThreshold = true;
    const table = requireTreatyTable()!;
    // Collapse split back to one contracts-focused table for clarity
    const contractsView = cloneViewForTab(table.view, 'contracts');
    contractsView.columnsByView.contracts = new Set([
      ...contractsView.columnsByView.contracts,
      'lossRatio',
    ]);
    contractsView.thresholdsByView = {
      ...contractsView.thresholdsByView,
      contracts: [{ key: 'lossRatio', op: '>', value: 10 }],
    };
    const contractsTable = createTableObject(table.treatyId, {
      id: 'table-tor-main',
      view: contractsView,
    });
    state.desk = [
      ...state.desk.filter((o) => o.kind === 'insight'),
      contractsTable,
    ];
    state.layout = 'stack';
    state.focusTableId = contractsTable.id;
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'Contracts with loss ratio over 10% — threshold is on the desk. You can also add thresholds from the gear search.',
        [
          {
            type: 'chip',
            label: 'Filter',
            value: 'LR > 10%',
            apply: {
              type: 'set-threshold',
              viewId: 'contracts',
              key: 'lossRatio',
              op: '>',
              value: 10,
              tableId: contractsTable.id,
            },
          },
        ],
      ),
    ];
    render();
    return;
  }

  if (q.includes('other section') || q.includes('against other') || q.includes('peer')) {
    const table = expandToTreatyTable(tid, {
      section: null,
      tab: 'sections',
      highlightDue: true,
      exploredPeers: true,
    });
    state.focusTableId = table.id;
    state.flash = 'section';
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'Zoomed out to the treaty — all nine sections on the desk. A – EU is the only open row.',
      ),
    ];
    render();
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
    return;
  }

  if (q.includes('signed line')) {
    const table = requireTreatyTable()!;
    const enabled = new Set(table.view.enabledViews);
    enabled.add('signed-lines');
    patchTableView(
      table.id,
      { tab: 'signed-lines', section: null, exploredPeers: true, enabledViews: enabled },
      'tab',
    );
    state.messages = [
      ...state.messages,
      msg('agent', "I've turned on the Signed lines view for this treaty."),
    ];
    render();
    return;
  }

  if (q.includes('draft') || q.includes('query')) {
    state.draftOpen = true;
    state.messages = [
      ...state.messages,
      msg('agent', 'Draft is open below the desk actions — edit it or send when ready.'),
    ];
    render();
    return;
  }

  if (q.includes('section') && (q.includes('a -') || q.includes('a–') || q.includes('eu'))) {
    applyDeskOp({ type: 'focus-section', treatyId: tid, section: 'A - EU', highlightDue: true });
    state.messages = [
      ...state.messages,
      msg('agent', 'Focused the desk on section A – EU again.'),
    ];
    render();
    return;
  }

  state.messages = [
    ...state.messages,
    msg(
      'agent',
      'Try a suggestion — residual %, Allianz compare, side-by-side tables, or a loss-ratio threshold.',
    ),
  ];
  render();
}

function sendCompose(): void {
  const text = state.compose.trim();
  if (!text) return;
  state.compose = '';
  if (state.screen === 'home') {
    const tor = ATTENTION.find((a) => a.id === 'tor-fix')!;
    openCase(tor);
    state.messages = [
      ...state.messages,
      msg('user', text),
      msg('agent', 'Opened the top resolve item so we have a desk to work on.'),
    ];
    render();
    return;
  }
  agentReply(text);
}

function renderTopnav(): string {
  return `<nav class="topnav">
    <a href="/gallery.html">Gallery</a>
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
  const sorted = sortAttention(ATTENTION, state.homeSort);
  const cards = sorted
    .map((item) => {
      const kind = KIND_LABEL[item.kind];
      return `<button type="button" class="attention-card${kind ? '' : ' no-kind'}" data-open="${esc(item.id)}">
      ${kind ? `<span class="kind">${esc(kind)}</span>` : ''}
      <span class="attention-copy">
        <h2>${esc(item.title)}</h2>
        <p>${esc(item.detail)}</p>
      </span>
      <span class="arrow-btn" aria-hidden="true">→</span>
    </button>`;
    })
    .join('');

  const sortByUrgency = state.homeSort === 'urgency';
  const sortLabel = sortByUrgency
    ? 'Sorted by urgency — click to sort by date added'
    : 'Sorted by date added — click to sort by urgency';

  return `${renderTopnav()}
    <main class="shell shell--home">
      <header class="home-hero">
        <h1>Good morning, ${esc(USER_NAME)}</h1>
        <div class="date">${esc(TODAY)}</div>
      </header>
      <div class="home-lead-row">
        <p class="home-lead">Here are the items that need your attention today:</p>
        <button type="button" class="icon-btn home-sort-btn" data-action="toggle-home-sort" aria-label="${esc(sortLabel)}" title="${esc(sortLabel)}">
          ${sortByUrgency ? iconSortUrgency() : iconSortDate()}
        </button>
      </div>
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

function renderEmptyState(colspan: number, tableId: string, noun: string): string {
  return `<tr><td colspan="${colspan}" class="empty-cell">
    <div class="empty-state">
      <p class="empty-title">Nothing here matches those filters.</p>
      <p class="empty-copy">No ${esc(noun)} made it through. Clear your filters to reset the view, or show everything and start fresh.</p>
      <div class="empty-actions">
        <button type="button" class="btn" data-empty-op="clear-filters" data-table-id="${esc(tableId)}">Clear filters</button>
        <button type="button" class="btn primary" data-empty-op="show-all" data-table-id="${esc(tableId)}">Show all</button>
      </div>
    </div>
  </td></tr>`;
}

function roleHint(role: FieldRole): string {
  if (role === 'dimension') return 'dimension';
  if (role === 'date') return 'date';
  if (role === 'measure') return 'measure';
  return 'id';
}

function renderSettingsTypeahead(view: ViewState, focus: ViewId, disabled: boolean): string {
  const focused = recipe(focus);
  const selected = view.columnsByView[focus];
  const q = state.settingsQuery.trim().toLowerCase();
  const thresholds = view.thresholdsByView[focus] ?? [];

  const selectedRows = focused.columns
    .filter((c) => selected.has(c.key))
    .map(
      (c) => `<div class="selected-chip">
      <span>${esc(c.label)}</span>
      <button type="button" class="selected-chip-x" data-column-view="${esc(focus)}" data-key="${esc(c.key)}" ${disabled ? 'disabled' : ''} aria-label="Remove ${esc(c.label)}">✕</button>
    </div>`,
    )
    .join('');

  const thresholdChips = thresholds
    .map(
      (t) => `<div class="selected-chip selected-chip--threshold">
      <span>${esc(t.key)} ${esc(t.op)} ${t.value}</span>
      <button type="button" class="selected-chip-x" data-remove-threshold="${esc(focus)}" data-threshold-key="${esc(t.key)}" ${disabled ? 'disabled' : ''} aria-label="Remove threshold">✕</button>
    </div>`,
    )
    .join('');

  const addable = focused.columns.filter((c) => {
    if (selected.has(c.key)) return false;
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q);
  });

  const thresholdHint =
    focus === 'contracts' &&
    (!q || q.includes('loss') || q.includes('lr') || q.includes('threshold') || q.includes('10'))
      ? `<button type="button" class="typeahead-item" data-add-threshold="${esc(focus)}" data-threshold-key="lossRatio" data-threshold-op=">" data-threshold-value="10" ${disabled ? 'disabled' : ''}>
        <span>Filter: Loss ratio &gt; 10%</span>
        <span class="typeahead-meta">threshold</span>
      </button>`
      : '';

  const items =
    addable
      .map(
        (c) => `<button type="button" class="typeahead-item" data-column-view="${esc(focus)}" data-key="${esc(c.key)}" data-add-column="1" ${disabled ? 'disabled' : ''}>
        <span>${esc(c.label)}</span>
        <span class="typeahead-meta">${esc(roleHint(c.role))}</span>
      </button>`,
      )
      .join('') + thresholdHint;

  const list =
    state.settingsSearchOpen && !disabled
      ? `<div class="typeahead-list" data-typeahead-list>${items || `<p class="typeahead-empty">No matches</p>`}</div>`
      : '';

  return `<div class="settings-selected">${selectedRows}${thresholdChips || ''}</div>
    <div class="typeahead${state.settingsSearchOpen ? ' is-open' : ''}">
      <label class="typeahead-label">
        <span class="visually-hidden">Add column or filter</span>
        <input type="search" class="typeahead-input" data-settings-query placeholder="Add column or filter…" value="${esc(state.settingsQuery)}" ${disabled ? 'disabled' : ''} autocomplete="off" />
      </label>
      ${list}
    </div>`;
}

function renderConfirmRemoveModal(): string {
  if (state.modal !== 'confirm-remove' || !state.pendingRemoveId) return '';
  const panel = state.desk.find((o) => o.id === state.pendingRemoveId);
  const label =
    panel?.kind === 'table'
      ? (panel.title ?? treatyFor(panel)?.label ?? 'this panel')
      : panel?.kind === 'section'
        ? `Section: ${panel.section.replace(' - ', ' – ')}`
        : panel?.kind === 'insight'
          ? panel.title
          : 'this panel';
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-card modal-card--confirm" data-stop role="dialog" aria-label="Remove panel">
      <div class="modal-head">
        <h3>Remove panel?</h3>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Close">✕</button>
      </div>
      <p class="confirm-copy">Remove <strong>${esc(label)}</strong> from the desk? You can always ask the agent to bring it back.</p>
      <div class="modal-foot">
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button type="button" class="btn primary" data-action="confirm-remove">Remove</button>
      </div>
    </div>
  </div>`;
}

function renderActiveModal(table: TableDeskObject, obj: TreatyObject): string {
  if (state.modal === 'confirm-remove') return renderConfirmRemoveModal();
  if (state.modal !== 'settings') return '';
  const view = table.view;
  const focus = state.settingsFocus;
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
        <h4 class="check-group-title">Columns & filters</h4>
        ${renderSettingsTypeahead(view, focus, !focusEnabled)}
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

function renderThresholdChips(viewId: ViewId, view: ViewState): string {
  const list = view.thresholdsByView[viewId] ?? [];
  return list
    .map(
      (t) =>
        `<span class="threshold-chip${state.flash === 'threshold' ? ' agent-touched' : ''}">${esc(t.key)} ${esc(t.op)} ${t.value}${t.key === 'lossRatio' ? '%' : ''}</span>`,
    )
    .join('');
}

function renderFilterToolbar(viewId: ViewId, view: ViewState, obj: TreatyObject): string {
  const fields = activeFilterFields(viewId, view.columnsByView[viewId]);
  const parts: string[] = [];
  if (viewId === 'sections') {
    const pin = renderSectionPin(obj, view);
    if (pin) parts.push(pin);
  }
  for (const field of fields) {
    if (viewId === 'sections' && field.key === 'section') continue;
    if (isDateField(field)) parts.push(renderDateFacet(viewId, field, view));
    else if (isDimension(field)) parts.push(renderDimFacet(viewId, field, view, obj));
  }
  parts.push(renderThresholdChips(viewId, view));
  if (parts.length === 0) return '';
  return `<div class="table-toolbar">${parts.join('')}</div>`;
}

function tdCell(html: string, className?: string): string {
  const cls = className ? ` class="${esc(className)}"` : '';
  return `<td${cls}><span class="cell-text">${html}</span></td>`;
}

function cellClass(role: FieldRole, extra?: string): string | undefined {
  const parts = [role === 'measure' ? 'num' : '', extra ?? ''].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

function renderSectionsTable(obj: TreatyObject, view: ViewState, tableId: string): string {
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
      ? renderEmptyState(Math.max(cols.length, 1), tableId, 'sections')
      : rows
          .map(
            (r) => `<tr class="${r.status === 'Open' ? 'open' : ''}">
      ${cols
        .map((c) => {
          const em = c.key === 'due' && r.dueEmphasis && view.highlightDue ? 'em' : undefined;
          return tdCell(sectionCell(r, c.key), cellClass(c.role, em));
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
  if (key === 'lossRatioPct') return esc(r.lossRatio);
  return esc(r[key as keyof ContractRow]?.toString() ?? '');
}

function statementCell(r: StatementRow, key: string): string {
  if (key === 'dateIso') return esc(r.date);
  return esc(r[key as keyof StatementRow] ?? '');
}

function renderContracts(obj: TreatyObject, view: ViewState, tableId: string): string {
  const colDefs = recipe('contracts').columns;
  const cols = colDefs.filter((c) => view.columnsByView.contracts.has(c.key));
  const filters = view.filtersByView.contracts;
  const visible = view.columnsByView.contracts;
  const thresholds = view.thresholdsByView.contracts ?? [];
  const rows = obj.contracts.filter((r) => {
    if (!facetAllows(filters, 'reinsured', r.reinsured, visible.has('reinsured'))) return false;
    if (!facetAllows(filters, 'section', r.section, visible.has('section'))) return false;
    if (!facetAllows(filters, 'currency', r.currency, visible.has('currency'))) return false;
    if (!thresholdAllows(thresholds, 'lossRatio', r.lossRatioPct)) return false;
    return true;
  });

  const body =
    rows.length === 0
      ? renderEmptyState(Math.max(cols.length, 1), tableId, 'contracts')
      : rows
          .map(
            (r) =>
              `<tr>${cols.map((c) => tdCell(contractCell(r, c.key), cellClass(c.role))).join('')}</tr>`,
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

function renderStatements(obj: TreatyObject, view: ViewState, tableId: string): string {
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
      ? renderEmptyState(Math.max(cols.length, 1), tableId, 'statements')
      : rows
          .map(
            (r) =>
              `<tr>${cols.map((c) => tdCell(statementCell(r, c.key), cellClass(c.role))).join('')}</tr>`,
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

function renderSignedLines(obj: TreatyObject, view: ViewState, tableId: string): string {
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
      ? renderEmptyState(Math.max(cols.length, 1), tableId, 'signed lines')
      : rows
          .map(
            (r) =>
              `<tr>${cols.map((c) => tdCell(signedCell(r, c.key), cellClass(c.role))).join('')}</tr>`,
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

function renderTableObject(table: TableDeskObject): string {
  const obj = treatyFor(table);
  if (!obj) {
    return `<section class="display-object"><p class="residual">Unknown treaty.</p></section>`;
  }
  const view = table.view;
  const tab = view.tab;
  const heading = table.title ?? obj.label;
  const showChrome = !table.title;
  const canRemove = tableCount() > 1;

  const tableBody =
    tab === 'sections'
      ? renderSectionsTable(obj, view, table.id)
      : tab === 'signed-lines'
        ? renderSignedLines(obj, view, table.id)
        : tab === 'contracts'
          ? renderContracts(obj, view, table.id)
          : renderStatements(obj, view, table.id);

  return `<section class="display-object${state.flash === 'tab' || state.flash === 'residual' ? ' agent-touched' : ''}${table.title ? ' is-pane' : ''}" data-table-id="${esc(table.id)}">
    <div class="display-head">
      <div>
        <h3>${esc(heading)}</h3>
        ${
          showChrome
            ? `<div class="pills">
          <span class="pill">Signed line (blended) <span class="pill--num">${esc(obj.signedLineBlended)}</span></span>
          <span class="pill">Settlement: ${esc(obj.settlement)}</span>
          <span class="pill">${esc(obj.period)}</span>
        </div>`
            : `<div class="pills"><span class="pill">${esc(obj.label)}</span></div>`
        }
      </div>
      <div class="display-head-actions">
        <button type="button" class="icon-btn" data-action="open-settings" data-table-id="${esc(table.id)}" aria-label="Table settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.65 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.13.23.4.32.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.09.48 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>
          </svg>
        </button>
        ${
          canRemove
            ? `<button type="button" class="icon-btn" data-action="request-remove" data-table-id="${esc(table.id)}" aria-label="Remove panel">✕</button>`
            : ''
        }
      </div>
    </div>
    ${
      showChrome
        ? `<div class="residual${state.flash === 'residual' ? ' agent-touched' : ''}">
      <strong>${esc(obj.residualNote)}</strong>
      <span class="scale">${esc(obj.residualScale)}</span>
    </div>`
        : ''
    }
    ${
      !table.title && view.enabledViews.size > 1
        ? `<div class="view-tabs" role="tablist">
      ${TREATY_VIEW_CATALOG.filter((v) => view.enabledViews.has(v.id))
        .map(
          (v) =>
            `<button type="button" role="tab" class="view-tab${tab === v.id ? ' active' : ''}" data-tab="${esc(v.id)}" data-table-id="${esc(table.id)}" aria-selected="${tab === v.id}">${esc(v.label)}</button>`,
        )
        .join('')}
    </div>`
        : ''
    }
    ${tableBody}
  </section>`;
}

function renderSectionDeskObject(sectionObj: SectionDeskObject): string {
  const treaty = TREATIES[sectionObj.treatyId];
  if (!treaty) {
    return `<section class="section-object"><p class="residual">Unknown treaty.</p></section>`;
  }
  const row = treaty.sections.find((r) => r.section === sectionObj.section);
  if (!row) {
    return `<section class="section-object"><p class="residual">Unknown section.</p></section>`;
  }
  return renderSectionObject(sectionObj, treaty, row, {
    flash: state.flash === 'residual',
    showRemove: mainObjectCount() > 1,
  });
}

function renderDeskObject(o: DeskObject): string {
  if (o.kind === 'table') return renderTableObject(o);
  if (o.kind === 'section') return renderSectionDeskObject(o);
  return renderInsightWidget(o, {
    flash: state.flash === 'residual',
    showRemove: true,
    interactiveLinks: true,
  });
}

function renderDesk(): string {
  if (state.desk.length === 0) {
    return `<section class="display-object"><p class="residual">No projected display object for this item in the prototype.</p></section>`;
  }
  const mains = state.desk.filter(
    (o) => o.kind === 'insight' || o.kind === 'section' || (o.kind === 'table' && !o.title),
  );
  const panes = state.desk.filter((o): o is TableDeskObject => o.kind === 'table' && !!o.title);
  const mainHtml = mains.map(renderDeskObject).join('');
  const panesHtml =
    panes.length > 0
      ? `<div class="desk-split-row">${panes.map((o) => renderTableObject(o)).join('')}</div>`
      : '';
  return `<div class="desk-composition">${mainHtml}${panesHtml}</div>`;
}

function renderMessage(m: Message): string {
  const msgIdx = state.messages.indexOf(m);
  const inner = m.parts
    .map((p, partIdx) => {
      if (p.type === 'text') return `<span class="bubble-text">${esc(p.text)}</span>`;
      const menuOpen =
        state.chipMenu?.msg === msgIdx && state.chipMenu.part === partIdx;
      const menu = menuOpen
        ? `<div class="chip-menu" role="menu">
            <button type="button" class="chip-menu-item" role="menuitem" data-chip-add-desk data-chip-msg="${msgIdx}" data-chip-part="${partIdx}">Add to desk</button>
          </div>`
        : '';
      return `<span class="readout-chip-wrap">
        <button type="button" class="readout-chip${menuOpen ? ' is-open' : ''}" data-chip-msg="${msgIdx}" data-chip-part="${partIdx}" aria-haspopup="menu" aria-expanded="${menuOpen}" title="Actions">
          <span class="readout-chip-label">${esc(p.label)}</span>
          <span class="readout-chip-value">${esc(p.value)}</span>
        </button>
        ${menu}
      </span>`;
    })
    .join(' ');
  return `<div class="bubble ${m.role}">${inner}</div>`;
}

function renderThread(): string {
  if (state.chatCollapsed) {
    return `<aside class="chat chat--collapsed" aria-label="Chat collapsed">
      <button type="button" class="icon-btn chat-rail-btn" data-action="expand-chat" aria-label="Expand chat" title="Expand chat">
        ${iconPanelSidebar()}
      </button>
    </aside>`;
  }

  const msgs = state.messages.map(renderMessage).join('');
  const used = new Set(
    state.messages.filter((m) => m.role === 'user').map((m) => userText(m).toLowerCase()),
  );
  const suggestions = activeSuggestions()
    .filter((s) => !used.has(s.toLowerCase()))
    .map((s) => `<button type="button" class="suggestion" data-suggest="${esc(s)}">${esc(s)}</button>`)
    .join('');

  return `<aside class="chat">
    <div class="chat-toolbar">
      <button type="button" class="icon-btn chat-rail-btn" data-action="collapse-chat" aria-label="Collapse chat" title="Collapse chat">
        ${iconPanelSidebar()}
      </button>
    </div>
    <div class="chat-panel">
      <div class="thread-messages">${msgs}</div>
      ${suggestions ? `<div class="suggestions">${suggestions}</div>` : ''}
    </div>
    ${renderCompose({ variant: 'chat' })}
  </aside>`;
}

function renderCase(): string {
  const item = currentItem();
  if (!item) return renderHome();
  const table = primaryTable();
  const tid = caseTreatyId();
  const obj = tid ? TREATIES[tid] ?? null : null;

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
          <p>Canonical host for this data object — same tabs and tables, full chrome.</p>
          <button type="button" class="btn primary" data-action="close-full">Back to case desk</button>
        </div>
      </div>`
    : '';

  const modals =
    state.modal === 'confirm-remove'
      ? renderConfirmRemoveModal()
      : table && obj
        ? renderActiveModal(table, obj)
        : '';

  return `<div class="case-page${state.chatCollapsed ? ' chat-collapsed' : ''}">${renderTopnav()}
    <main class="case-body">
      <div class="desk-stage">
        <section class="desk" aria-label="Desk">
          <div class="desk-rail-head">
            <button type="button" class="all-issues" data-action="home">← All issues</button>
          </div>
          <div class="desk-scroll">
            <div class="case-banner">
              <span class="kind">${esc(KIND_LABEL[item.kind] || 'Case')}</span>
              <div class="case-banner-copy">
                <h2>${esc(item.title)}</h2>
                <span class="meta">${esc(item.detail)}</span>
              </div>
            </div>
            ${renderDesk()}
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
    ${modals}
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
        if (el.hasAttribute('data-stop')) return;
        if (target.closest('[data-stop]') && target.closest('[data-action="close-modal"]') !== el) {
          return;
        }
        if (el.classList.contains('modal-backdrop') && target !== el) return;
        state.modal = null;
        state.settingsQuery = '';
        state.settingsSearchOpen = false;
        state.pendingRemoveId = null;
        render();
        return;
      }
      if (action === 'open-settings') {
        const tid = el.dataset.tableId;
        if (tid) state.focusTableId = tid;
        state.modal = 'settings';
        const t = primaryTable();
        if (t) state.settingsFocus = t.view.tab;
        state.settingsQuery = '';
        state.settingsSearchOpen = false;
        render();
        return;
      }
      if (action === 'request-remove') {
        e.stopPropagation();
        const id = el.dataset.tableId;
        if (id) requestRemovePanel(id);
        return;
      }
      if (action === 'confirm-remove') {
        confirmRemovePanel();
        return;
      }
      if (action === 'collapse-chat') {
        state.chatCollapsed = true;
        render();
        return;
      }
      if (action === 'expand-chat') {
        state.chatCollapsed = false;
        render();
        return;
      }
      if (action === 'toggle-home-sort') {
        state.homeSort = state.homeSort === 'urgency' ? 'added' : 'urgency';
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
          msg('user', 'Sent the query draft.'),
          msg(
            'agent',
            'Marked under query. The case stays on the desk until a corrected statement re-lands, or you resolve with an outcome.',
          ),
        ];
        render();
      }
      if (action === 'save') {
        state.saved = true;
        render();
      }
      if (action === 'section' && el instanceof HTMLSelectElement) {
        /* handled below */
      }
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.tableId;
      if (tid) state.focusTableId = tid;
      patchTableView(tid, { tab: btn.dataset.tab as DeskTab });
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-insight-op]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.insightOp;
      const table = primaryTable();
      if (op === 'reveal-source' && table) {
        applyDeskOp({ type: 'highlight-residual', tableId: table.id });
        return;
      }
      if (op === 'draft-from-narrative') {
        state.draftOpen = true;
        render();
      }
    });
  });

  const sectionSelect = app.querySelector<HTMLSelectElement>('[data-action="section"]');
  sectionSelect?.addEventListener('change', () => {
    patchTableView(undefined, { section: sectionSelect.value || null });
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
      const table = primaryTable();
      if (!table) return;
      const viewId = input.dataset.dateView as ViewId;
      const bound = input.dataset.dateBound as 'from' | 'to';
      const prev = table.view.dateRangeByView[viewId] ?? { from: '', to: '' };
      const next = { ...prev, [bound]: input.value };
      patchTableView(table.id, {
        dateRangeByView: { ...table.view.dateRangeByView, [viewId]: next },
      });
    });
  });

  app.querySelectorAll<HTMLElement>('[data-add-column]').forEach((el) => {
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', () => {
      const viewId = el.getAttribute('data-column-view') as ViewId;
      const key = el.getAttribute('data-key')!;
      const table = primaryTable();
      if (!table || table.view.columnsByView[viewId].has(key)) return;
      toggleColumn(viewId, key);
      state.settingsSearchOpen = true;
    });
  });

  app.querySelectorAll<HTMLButtonElement>('.selected-chip-x[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const viewId = btn.dataset.columnView as ViewId;
      const key = btn.dataset.key!;
      const table = primaryTable();
      if (!table || !table.view.columnsByView[viewId].has(key)) return;
      toggleColumn(viewId, key);
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-add-threshold]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      applyDeskOp({
        type: 'set-threshold',
        viewId: btn.dataset.addThreshold as ViewId,
        key: btn.dataset.thresholdKey!,
        op: (btn.dataset.thresholdOp as MeasureThreshold['op']) ?? '>',
        value: Number(btn.dataset.thresholdValue ?? 10),
      });
      state.modal = null;
      state.settingsQuery = '';
      state.settingsSearchOpen = false;
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-remove-threshold]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const table = primaryTable();
      if (!table) return;
      const viewId = btn.dataset.removeThreshold as ViewId;
      const key = btn.dataset.thresholdKey!;
      const list = (table.view.thresholdsByView[viewId] ?? []).filter((t) => t.key !== key);
      patchTableView(table.id, {
        thresholdsByView: { ...table.view.thresholdsByView, [viewId]: list },
      });
    });
  });

  const settingsQuery = app.querySelector<HTMLInputElement>('[data-settings-query]');
  settingsQuery?.addEventListener('focus', () => {
    if (!state.settingsSearchOpen) {
      state.settingsSearchOpen = true;
      const pos = settingsQuery.selectionStart;
      render();
      const again = app.querySelector<HTMLInputElement>('[data-settings-query]');
      again?.focus();
      if (pos != null) again?.setSelectionRange(pos, pos);
    }
  });
  settingsQuery?.addEventListener('input', () => {
    state.settingsQuery = settingsQuery.value;
    state.settingsSearchOpen = true;
    const pos = settingsQuery.selectionStart;
    render();
    const again = app.querySelector<HTMLInputElement>('[data-settings-query]');
    again?.focus();
    if (pos != null) again?.setSelectionRange(pos, pos);
  });
  settingsQuery?.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (!state.settingsSearchOpen) return;
      // Keep open if focus moved into the list (mousedown on item).
      const active = document.activeElement;
      if (active?.closest?.('[data-typeahead-list]')) return;
      state.settingsSearchOpen = false;
      render();
    }, 120);
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
      state.settingsQuery = '';
      render();
    });
  });

  app.querySelector('.modal-card')?.addEventListener('click', (e) => e.stopPropagation());

  app.querySelectorAll<HTMLButtonElement>('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      agentReply(btn.dataset.suggest!);
    });
  });

  app.querySelectorAll<HTMLButtonElement>('.readout-chip[data-chip-msg]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mi = Number(btn.dataset.chipMsg);
      const pi = Number(btn.dataset.chipPart);
      if (state.chipMenu?.msg === mi && state.chipMenu.part === pi) {
        state.chipMenu = null;
      } else {
        state.chipMenu = { msg: mi, part: pi };
      }
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-chip-add-desk]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mi = Number(btn.dataset.chipMsg);
      const pi = Number(btn.dataset.chipPart);
      const part = state.messages[mi]?.parts[pi];
      if (part?.type === 'chip' && part.apply) applyDeskOp(part.apply);
      else state.chipMenu = null;
      render();
    });
  });

  if (state.chipMenu) {
    const closeMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.readout-chip-wrap')) return;
      state.chipMenu = null;
      render();
    };
    window.setTimeout(() => {
      document.addEventListener('click', closeMenu, { once: true });
    }, 0);
  }

  app.querySelectorAll<HTMLButtonElement>('[data-empty-op]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.emptyOp as 'clear-filters' | 'show-all';
      applyDeskOp({ type: op, tableId: btn.dataset.tableId });
    });
  });

  app.querySelectorAll<HTMLElement>('[data-table-id].display-object').forEach((el) => {
    el.addEventListener('click', () => {
      const tid = el.getAttribute('data-table-id');
      if (tid && tid !== state.focusTableId) {
        state.focusTableId = tid;
        render();
      }
    });
  });
}

render();
