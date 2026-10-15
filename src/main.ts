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
  createSectionObject,
  createTableObject,
  residualInsightTor,
  type DeskLayout,
  type DeskObject,
  type DeskOp,
  type InsightDeskObject,
  type SectionDeskObject,
  type TableDeskObject,
} from './desk.ts';
import { residualTorCalculation, type CalculationBlock } from './insight.ts';
import { renderCalculationBlock, renderInsightWidget } from './insight-render.ts';
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

type DeskMode = 'roster' | 'focus';
type ModalKind = 'settings' | 'confirm-remove' | null;
type DrawerRange = 'today' | 'week' | 'last-week' | 'month' | 'custom';

type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'calc'; calc: CalculationBlock; apply?: DeskOp }
  | { type: 'chip'; label: string; value: string; apply?: DeskOp };

interface Message {
  role: 'agent' | 'user';
  parts: MessagePart[];
}

/** One parked issue’s working set — desk objects + draft + demo progress. */
interface DrawerCluster {
  caseId: string;
  title: string;
  detail: string;
  kind: AttentionItem['kind'];
  desk: DeskObject[];
  layout: DeskLayout;
  focusTableId: string | null;
  draftOpen: boolean;
  draftSent: boolean;
  draftBody: string;
  demo: AppState['demo'];
  updatedAt: number;
}

interface AppState {
  /** Roster (all open issues) or one focused issue — same desk, chat never leaves. */
  deskMode: DeskMode;
  caseId: string | null;
  desk: DeskObject[];
  layout: DeskLayout;
  /** Table object targeted by settings / mutations. */
  focusTableId: string | null;
  messages: Message[];
  draftOpen: boolean;
  /** Draft stays visible after send with a sent affordance. */
  draftSent: boolean;
  draftBody: string;
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
  /** Transient toast (e.g. dismiss draft with undo). */
  toast: { id: number; message: string } | null;
  /** Snapshot for undo after dismissing the draft widget. */
  draftUndo: { body: string; sent: boolean } | null;
  /** Parked issue clusters (metal tray). */
  drawer: DrawerCluster[];
  /** Drawer dropdown open under the toggle. */
  drawerOpen: boolean;
  /** Time filter for drawer list. */
  drawerRange: DrawerRange;
  drawerCustomFrom: string;
  drawerCustomTo: string;
  /** Multi-select for bulk clear. */
  drawerSelected: string[];
  demo: {
    sawResidualPct: boolean;
    sawZoomOut: boolean;
    sawDraft: boolean;
    sawPortfolio: boolean;
  };
}

const SUGGEST_OPEN_TOR = 'Open the TOR resolve item';
const SUGGEST_RESIDUAL_PCT = 'What % of section ITD is the residual?';
const SUGGEST_CONTEXT = 'Can you give me more context on this?';
const SUGGEST_DRAFT = 'Draft a query for the residual';
const SUGGEST_ALL_ISSUES = 'Show me all open issues';
const SUGGEST_NEXT = 'Next issue';
const SUGGEST_PORTFOLIO = 'Do any other reinsurers have an open residual?';
const SUGGEST_JUST_TELL = 'Don’t change the desk — just tell me the residual %';

const DEFAULT_DRAFT_BODY =
  'Please review the €40,000 residual on Due for section A - EU on the Q1 2026 statement. Internal tie-out does not reconcile within tolerance (€1). Kindly confirm or provide a corrected bordereaux.';

function msg(role: Message['role'], text: string, extras: MessagePart[] = []): Message {
  return { role, parts: [{ type: 'text', text }, ...extras] };
}

function userText(m: Message): string {
  return m.parts
    .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
}

function activeSuggestions(): string[] {
  if (state.deskMode === 'roster') return [SUGGEST_OPEN_TOR];
  if (!caseTreatyId()) return [SUGGEST_ALL_ISSUES, SUGGEST_NEXT];
  const d = state.demo;
  const out: string[] = [];
  // Investigation story: materiality → situate → query → back to roster / next → optional portfolio.
  if (!d.sawResidualPct) out.push(SUGGEST_RESIDUAL_PCT);
  else if (!d.sawZoomOut) out.push(SUGGEST_CONTEXT);
  else if (!d.sawDraft) out.push(SUGGEST_DRAFT);
  else {
    out.push(SUGGEST_ALL_ISSUES, SUGGEST_NEXT);
    if (!d.sawPortfolio) out.push(SUGGEST_PORTFOLIO);
    else out.push(SUGGEST_JUST_TELL);
  }
  return out;
}

function emptyDemo(): AppState['demo'] {
  return {
    sawResidualPct: false,
    sawZoomOut: false,
    sawDraft: false,
    sawPortfolio: false,
  };
}

const state: AppState = {
  deskMode: 'roster',
  caseId: null,
  desk: [],
  layout: 'stack',
  focusTableId: null,
  messages: [
    msg(
      'agent',
      'Here are the items that need your attention today. Open one to clear the others into the drawer — chat stays with you.',
    ),
  ],
  draftOpen: false,
  draftSent: false,
  draftBody: DEFAULT_DRAFT_BODY,
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
  toast: null,
  draftUndo: null,
  drawer: [],
  drawerOpen: false,
  drawerRange: 'today',
  drawerCustomFrom: '',
  drawerCustomTo: '',
  drawerSelected: [],
  demo: emptyDemo(),
};

let toastTimer: number | null = null;
let toastSeq = 0;
let pendingDeskScroll = false;

function markDeskScroll(): void {
  pendingDeskScroll = true;
}

function showToast(message: string): void {
  if (toastTimer != null) window.clearTimeout(toastTimer);
  const id = ++toastSeq;
  state.toast = { id, message };
  render();
  toastTimer = window.setTimeout(() => {
    if (state.toast?.id === id) {
      state.toast = null;
      state.draftUndo = null;
      render();
    }
  }, 5000);
}

function dismissDraftWidget(): void {
  if (!state.draftOpen) return;
  const ta = app.querySelector<HTMLTextAreaElement>('[data-draft-body]');
  if (ta && !state.draftSent) state.draftBody = ta.value;
  state.draftUndo = { body: state.draftBody, sent: state.draftSent };
  state.draftOpen = false;
  state.draftSent = false;
  showToast('Widget dismissed');
}

function undoDismissDraft(): void {
  if (!state.draftUndo) return;
  state.draftBody = state.draftUndo.body;
  state.draftSent = state.draftUndo.sent;
  state.draftOpen = true;
  state.draftUndo = null;
  state.toast = null;
  if (toastTimer != null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  markDeskScroll();
  render();
}

function scrollDeskToLatest(): void {
  const scroller = app.querySelector('.desk-scroll');
  if (!scroller) return;
  const widgets = scroller.querySelectorAll(
    '.desk-composition > *, .draft-panel',
  );
  const last = widgets[widgets.length - 1] as HTMLElement | undefined;
  if (!last) return;
  requestAnimationFrame(() => {
    last.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
  });
}

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

/** Desk organizer tray — box with shelf lines. */
function iconDrawer(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="4" y="5" width="16" height="14" rx="1.5"/>
    <path d="M4 10.5h16"/>
    <path d="M4 15h16"/>
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
  // Prefer the case section (first section on desk) over any expanded table.
  return primarySection()?.treatyId ?? primaryTable()?.treatyId ?? null;
}

function tableById(id: string | undefined): TableDeskObject | null {
  if (!id) return primaryTable();
  return state.desk.find((o): o is TableDeskObject => o.kind === 'table' && o.id === id) ?? null;
}

function treatyFor(table: TableDeskObject): TreatyObject | null {
  return TREATIES[table.treatyId] ?? null;
}

function sectionObjects(): SectionDeskObject[] {
  return state.desk.filter((o): o is SectionDeskObject => o.kind === 'section');
}

/** Patch fields on the case section card without rebuilding the desk. */
function patchCaseSection(
  patch: Partial<Pick<SectionDeskObject, 'highlightDue' | 'residualShare' | 'section'>>,
): void {
  const cur = primarySection();
  if (!cur) return;
  state.desk = state.desk.map((o) =>
    o.kind === 'section' && o.id === cur.id ? { ...o, ...patch } : o,
  );
}

/** Case focus section — owns the primary desk slot (optionally keep an added treaty table). */
function focusSectionOnDesk(
  treatyId: string,
  section: string,
  opts?: {
    highlightDue?: boolean;
    residualShare?: string;
    keepTables?: boolean;
  },
): SectionDeskObject {
  const sectionObj = createSectionObject(treatyId, section, {
    highlightDue: opts?.highlightDue ?? true,
    residualShare: opts?.residualShare,
  });
  const tables = opts?.keepTables
    ? state.desk.filter((o): o is TableDeskObject => o.kind === 'table' && !o.title)
    : [];
  const insights = state.desk.filter((o): o is InsightDeskObject => o.kind === 'insight');
  const panes = state.desk.filter((o): o is TableDeskObject => o.kind === 'table' && !!o.title);
  state.desk = [sectionObj, ...tables, ...insights, ...panes];
  state.focusTableId = tables[0]?.id ?? null;
  state.layout = 'stack';
  return sectionObj;
}

/**
 * Add (or refresh) the treaty sections table under the case section card.
 * Keeps the section focus object so both are visible for now.
 */
function addTreatyTableBesideSection(
  treatyId: string,
  viewPatch?: Partial<ViewState>,
): TableDeskObject {
  const caseSection =
    primarySection() ?? focusSectionOnDesk(treatyId, 'A - EU', { highlightDue: true });

  const base = defaultViewState(treatyId);
  const view = {
    ...base,
    ...viewPatch,
    tab: 'sections' as ViewId,
    section: null,
    highlightDue: true,
    exploredPeers: true,
  };

  let table = primaryTable();
  if (table && table.treatyId === treatyId) {
    patchTable(table.id, { view: { ...table.view, ...view } });
  } else {
    table = createTableObject(treatyId, { id: `table-${treatyId}-sections`, view });
  }

  const insights = state.desk.filter((o): o is InsightDeskObject => o.kind === 'insight');
  const panes = state.desk.filter((o): o is TableDeskObject => o.kind === 'table' && !!o.title);
  // Only this treaty's case section + its collection table (drop foreign peer sections).
  state.desk = [caseSection, table, ...insights, ...panes];
  state.focusTableId = table.id;
  state.layout = 'stack';
  markDeskScroll();
  return table;
}

/** Replace section focus with the treaty collection (used when an intent needs a table-only desk). */
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

/** Pin Residual / ITD beside the section card; keep the treaty table below. */
function placeResidualInsightBesideSection(): void {
  const tid = caseTreatyId() ?? 'tor-qs-2025';
  const section =
    primarySection() ??
    focusSectionOnDesk(tid, 'A - EU', { highlightDue: true, keepTables: true });
  patchCaseSection({ highlightDue: true });
  const insight = residualInsightTor();
  const tables = state.desk.filter((o): o is TableDeskObject => o.kind === 'table' && !o.title);
  const panes = state.desk.filter((o): o is TableDeskObject => o.kind === 'table' && !!o.title);
  const otherInsights = state.desk.filter(
    (o): o is InsightDeskObject => o.kind === 'insight' && o.id !== INSIGHT_RESIDUAL_ID,
  );
  state.desk = [section, insight, ...otherInsights, ...tables, ...panes];
  state.layout = 'split';
  markDeskScroll();
}

function applyDeskOp(op: DeskOp): void {
  if (op.type === 'focus-section') {
    focusSectionOnDesk(op.treatyId, op.section, {
      highlightDue: op.highlightDue ?? true,
      keepTables: true,
    });
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
    focusSectionOnDesk(tid, 'A - EU', {
      highlightDue: true,
      keepTables: true,
    });
    state.flash = 'residual';
    render();
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
    return;
  }

  if (op.type === 'show-residual-insight') {
    placeResidualInsightBesideSection();
    state.chipMenu = null;
    state.flash = 'residual';
    render();
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
    return;
  }

  if (op.type === 'add-peer-section') {
    state.chipMenu = null;
    render();
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

/** Snapshot the focused issue into the drawer (upsert by caseId). */
function parkCurrentCluster(): void {
  if (state.deskMode !== 'focus' || !state.caseId) return;
  const item = currentItem();
  const ta = app.querySelector<HTMLTextAreaElement>('[data-draft-body]');
  if (ta && state.draftOpen && !state.draftSent) state.draftBody = ta.value;
  const cluster: DrawerCluster = {
    caseId: state.caseId,
    title: item?.title ?? state.caseId,
    detail: item?.detail ?? '',
    kind: item?.kind ?? 'resolve',
    desk: structuredClone(state.desk),
    layout: state.layout,
    focusTableId: state.focusTableId,
    draftOpen: state.draftOpen,
    draftSent: state.draftSent,
    draftBody: state.draftBody,
    demo: { ...state.demo },
    updatedAt: Date.now(),
  };
  const idx = state.drawer.findIndex((c) => c.caseId === cluster.caseId);
  if (idx >= 0) state.drawer = state.drawer.map((c, i) => (i === idx ? cluster : c));
  else state.drawer = [cluster, ...state.drawer];
}

function clearFocusSurface(): void {
  state.caseId = null;
  state.desk = [];
  state.focusTableId = null;
  state.layout = 'stack';
  state.draftOpen = false;
  state.draftSent = false;
  state.draftBody = DEFAULT_DRAFT_BODY;
  state.demo = emptyDemo();
  state.fullRecord = false;
  state.flash = null;
  state.modal = null;
  state.settingsFocus = 'sections';
  state.settingsQuery = '';
  state.settingsSearchOpen = false;
  state.pendingRemoveId = null;
  state.chipMenu = null;
  state.draftUndo = null;
}

/** Put the issue roster back on the desk; park whatever was in focus. */
function showRoster(opts?: { quiet?: boolean }): void {
  parkCurrentCluster();
  state.deskMode = 'roster';
  clearFocusSurface();
  if (!opts?.quiet) {
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        state.drawer.length > 0
          ? `Roster’s back on the desk. ${state.drawer.length} issue${state.drawer.length === 1 ? '' : 's'} parked in the drawer — pull one up anytime.`
          : 'Roster’s back on the desk. Open an issue to focus — siblings go into the drawer.',
      ),
    ];
  }
  render();
}

function applyFreshFocus(item: AttentionItem, opts?: { announce?: string }): void {
  state.deskMode = 'focus';
  state.caseId = item.id;
  state.fullRecord = false;
  state.flash = null;
  state.modal = null;
  state.settingsFocus = 'sections';
  state.settingsQuery = '';
  state.settingsSearchOpen = false;
  state.pendingRemoveId = null;
  state.chipMenu = null;
  state.draftUndo = null;
  state.drawerOpen = false;

  let announce =
    opts?.announce ??
    null;

  if (!item.objectId) {
    state.desk = [];
    state.focusTableId = null;
    state.layout = 'stack';
    state.draftOpen = false;
    state.draftSent = false;
    state.draftBody = DEFAULT_DRAFT_BODY;
    state.demo = emptyDemo();
    announce =
      announce ??
      `I can open ${item.title.split(' ')[0]} as a case, but this prototype only projects a display object for TOR. Try the resolve item — or ask for all open issues.`;
  } else {
    const parked = state.drawer.find((c) => c.caseId === item.id);
    if (parked) {
      state.desk = structuredClone(parked.desk);
      state.layout = parked.layout;
      state.focusTableId = parked.focusTableId;
      state.draftOpen = parked.draftOpen;
      state.draftSent = parked.draftSent;
      state.draftBody = parked.draftBody;
      state.demo = { ...parked.demo };
      announce = announce ?? `Pulled “${item.title}” back from the drawer.`;
      markDeskScroll();
    } else {
      const sectionObj = createSectionObject(item.objectId, 'A - EU', { highlightDue: true });
      state.desk = [sectionObj];
      state.layout = 'stack';
      state.focusTableId = null;
      state.draftOpen = false;
      state.draftSent = false;
      state.draftBody = DEFAULT_DRAFT_BODY;
      state.demo = emptyDemo();
      announce =
        announce ??
        'Opened on section A – EU. Tie-out break sits on Due — check whether the residual is material, then ask for more context on this.';
    }
  }

  if (announce) state.messages = [...state.messages, msg('agent', announce)];
}

/** Focus one issue: park current work, restore cluster or start fresh. */
function focusIssue(item: AttentionItem): void {
  if (state.deskMode === 'focus' && state.caseId === item.id) {
    render();
    return;
  }
  parkCurrentCluster();
  applyFreshFocus(item);
  render();
}

function sortedAttention(): AttentionItem[] {
  return sortAttention(ATTENTION, state.homeSort);
}

/** Park current, open the next attention item after this one (wraps). */
function focusNextIssue(): void {
  const list = sortedAttention();
  if (list.length === 0) return;
  const cur = state.caseId ? list.findIndex((a) => a.id === state.caseId) : -1;
  const next = list[(cur + 1) % list.length]!;
  if (state.deskMode === 'focus' && next.id === state.caseId && list.length === 1) {
    state.messages = [
      ...state.messages,
      msg('agent', 'That’s the only open issue on the roster right now.'),
    ];
    render();
    return;
  }
  parkCurrentCluster();
  applyFreshFocus(next, {
    announce: next.objectId
      ? `Next up: ${next.title}. Prior work is in the drawer.`
      : `Next up: ${next.title}. No projected desk object in this prototype — try TOR, or ask for all open issues.`,
  });
  render();
}

function removeDrawerCluster(caseId: string): void {
  state.drawer = state.drawer.filter((c) => c.caseId !== caseId);
  state.drawerSelected = state.drawerSelected.filter((id) => id !== caseId);
  render();
}

function clearSelectedDrawerClusters(): void {
  if (state.drawerSelected.length === 0) return;
  const drop = new Set(state.drawerSelected);
  state.drawer = state.drawer.filter((c) => !drop.has(c.caseId));
  state.drawerSelected = [];
  showToast(
    drop.size === 1 ? 'Cleared 1 item from drawer' : `Cleared ${drop.size} items from drawer`,
  );
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function filteredDrawerClusters(): DrawerCluster[] {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const dayMs = 24 * 60 * 60 * 1000;
  let from = 0;
  let to = Number.POSITIVE_INFINITY;

  switch (state.drawerRange) {
    case 'today':
      from = todayStart;
      to = todayStart + dayMs;
      break;
    case 'week': {
      const dow = (now.getDay() + 6) % 7; // Mon=0
      from = todayStart - dow * dayMs;
      to = from + 7 * dayMs;
      break;
    }
    case 'last-week': {
      const dow = (now.getDay() + 6) % 7;
      const thisWeekStart = todayStart - dow * dayMs;
      from = thisWeekStart - 7 * dayMs;
      to = thisWeekStart;
      break;
    }
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      break;
    case 'custom': {
      if (state.drawerCustomFrom) {
        const [y, m, d] = state.drawerCustomFrom.split('-').map(Number);
        from = new Date(y!, m! - 1, d!).getTime();
      }
      if (state.drawerCustomTo) {
        const [y, m, d] = state.drawerCustomTo.split('-').map(Number);
        to = new Date(y!, m! - 1, d!).getTime() + dayMs;
      }
      break;
    }
  }

  return state.drawer.filter((c) => c.updatedAt >= from && c.updatedAt < to);
}

function requestRemovePanel(objectId: string): void {
  const target = state.desk.find((o) => o.id === objectId);
  if (!target) return;
  state.pendingRemoveId = objectId;
  state.modal = 'confirm-remove';
  render();
}

function confirmRemovePanel(): void {
  const id = state.pendingRemoveId;
  if (!id || !state.desk.some((o) => o.id === id)) {
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

  const wantsRoster =
    (q.includes('all') && (q.includes('issue') || q.includes('open'))) ||
    q.includes('show me all') ||
    q.includes('back to the list') ||
    q.includes('attention list') ||
    q.includes('roster');
  const wantsNext =
    q.includes('next issue') ||
    (q.includes('next') && (q.includes('case') || q.includes('item')));
  const wantsOpenTor =
    q.includes('open the tor') ||
    q.includes('tor resolve') ||
    (q.includes('open') && q.includes('tor'));

  if (wantsRoster) {
    showRoster();
    return;
  }
  if (wantsNext) {
    focusNextIssue();
    return;
  }
  if (wantsOpenTor || (state.deskMode === 'roster' && (q.includes('open') || q.includes('tor')))) {
    const tor = ATTENTION.find((a) => a.id === 'tor-fix')!;
    focusIssue(tor);
    return;
  }

  if (state.deskMode === 'roster') {
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'Pick an issue on the desk, or ask me to open the TOR resolve item.',
      ),
    ];
    render();
    return;
  }

  const tid = caseTreatyId();

  if (!tid || !TREATIES[tid]) {
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'This issue has no projected display object yet. Ask for all open issues, or open the TOR resolve item.',
      ),
    ];
    render();
    return;
  }

  const residualCalcPart: MessagePart = {
    type: 'calc',
    calc: residualTorCalculation(),
    apply: { type: 'show-residual-insight' },
  };

  if (
    (q.includes('just tell') || q.includes("don't change") || q.includes('don’t change')) &&
    (q.includes('residual') || q.includes('%') || q.includes('percent'))
  ) {
    state.demo.sawResidualPct = true;
    state.messages = [
      ...state.messages,
      msg('agent', 'Desk left as-is.', [residualCalcPart]),
    ];
    render();
    return;
  }

  if (
    (q.includes('residual') && (q.includes('%') || q.includes('percent') || q.includes('itd'))) ||
    q.includes('what % of section')
  ) {
    state.demo.sawResidualPct = true;
    if (primarySection()) {
      patchCaseSection({ highlightDue: true });
    } else {
      focusSectionOnDesk(tid, 'A - EU', { highlightDue: true, keepTables: true });
    }
    state.flash = 'residual';
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'Material enough to chase (tolerance €1). Pin the calculation beside the section when you’re ready.',
        [residualCalcPart],
      ),
    ];
    render();
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
    return;
  }

  if (
    q.includes('other reinsurer') ||
    q.includes('open residual') ||
    (q.includes('portfolio') && q.includes('residual')) ||
    (q.includes('allianz') && (q.includes('residual') || q.includes('open') || q.includes('compare')))
  ) {
    state.demo.sawPortfolio = true;
    const portfolioChip: MessagePart = {
      type: 'chip',
      label: 'Open residuals · panel',
      value: '1',
    };
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'Only Torgus has an open residual on your panel right now. Allianz and the others are tied — no matching section assumed.',
        [portfolioChip],
      ),
    ];
    render();
    return;
  }

  const wantsContext =
    q.includes('more context') ||
    q.includes('give me context') ||
    (q.includes('context') && q.includes('this'));
  const wantsPeerSections =
    q.includes('other section') ||
    q.includes('against other') ||
    q.includes('peer') ||
    (q.includes('open too') && q.includes('section'));

  if (wantsContext || wantsPeerSections) {
    state.demo.sawZoomOut = true;
    addTreatyTableBesideSection(tid, {
      section: null,
      tab: 'sections',
      highlightDue: true,
      exploredPeers: true,
    });
    state.flash = 'section';
    const reply = wantsContext
      ? 'Here’s the rest of the treaty around this break — A – EU is the only open section; Due is the outlier.'
      : 'Added the treaty’s sections under your A – EU card. Only A – EU is Open — the break is localized.';
    state.messages = [...state.messages, msg('agent', reply)];
    render();
    window.setTimeout(() => {
      state.flash = null;
      render();
    }, 900);
    return;
  }

  if (q.includes('signed line') && !q.includes('contract')) {
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
    state.demo.sawDraft = true;
    state.draftOpen = true;
    state.draftSent = false;
    state.messages = [
      ...state.messages,
      msg(
        'agent',
        'Draft is open under the desk — edit if needed, then send. When you’re done, ask for all open issues or next issue — work parks in the drawer automatically.',
      ),
    ];
    markDeskScroll();
    render();
    return;
  }

  if (q.includes('section') && (q.includes('a -') || q.includes('a–') || q.includes('eu'))) {
    focusSectionOnDesk(tid, 'A - EU', { highlightDue: true, keepTables: true });
    state.messages = [...state.messages, msg('agent', 'Back on section A – EU.')];
    render();
    return;
  }

  state.messages = [
    ...state.messages,
    msg(
      'agent',
      'Try a suggestion — residual %, more context on this, draft a query, or show all open issues.',
    ),
  ];
  render();
}

function sendCompose(): void {
  const text = state.compose.trim();
  if (!text) return;
  state.compose = '';
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

function renderRosterCards(): string {
  return sortedAttention()
    .map((item) => {
      const kind = KIND_LABEL[item.kind];
      const parked = state.drawer.some((c) => c.caseId === item.id);
      return `<button type="button" class="attention-card${kind ? '' : ' no-kind'}${parked ? ' is-parked' : ''}" data-open="${esc(item.id)}">
      ${kind ? `<span class="kind">${esc(kind)}</span>` : ''}
      <span class="attention-copy">
        <h2>${esc(item.title)}</h2>
        <p>${esc(item.detail)}</p>
        ${parked ? `<span class="parked-tag">In drawer</span>` : ''}
      </span>
      <span class="arrow-btn" aria-hidden="true">→</span>
    </button>`;
    })
    .join('');
}

function renderDrawerDropdown(): string {
  if (!state.drawerOpen) return '';
  const ranges: { id: DrawerRange; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This week' },
    { id: 'last-week', label: 'Last week' },
    { id: 'month', label: 'This month' },
    { id: 'custom', label: 'Custom' },
  ];
  const rangeTabs = ranges
    .map(
      (r) =>
        `<button type="button" class="drawer-range${state.drawerRange === r.id ? ' is-active' : ''}" data-action="drawer-range" data-range="${r.id}">${esc(r.label)}</button>`,
    )
    .join('');

  const custom =
    state.drawerRange === 'custom'
      ? `<div class="drawer-custom">
          <label>From <input type="date" data-drawer-from value="${esc(state.drawerCustomFrom)}" /></label>
          <label>To <input type="date" data-drawer-to value="${esc(state.drawerCustomTo)}" /></label>
        </div>`
      : '';

  const visible = filteredDrawerClusters();
  const selectedCount = state.drawerSelected.filter((id) =>
    visible.some((c) => c.caseId === id),
  ).length;
  const allVisibleSelected =
    visible.length > 0 && visible.every((c) => state.drawerSelected.includes(c.caseId));

  const rows =
    visible.length === 0
      ? `<p class="drawer-empty">${
          state.drawer.length === 0
            ? 'Drawer’s empty — focused work parks here when you leave an issue.'
            : 'Nothing in this time range.'
        }</p>`
      : visible
          .map((c) => {
            const checked = state.drawerSelected.includes(c.caseId);
            return `<div class="drawer-row">
              <label class="drawer-check">
                <input type="checkbox" data-drawer-select="${esc(c.caseId)}" ${checked ? 'checked' : ''} />
                <span class="visually-hidden">Select</span>
              </label>
              <button type="button" class="drawer-open" data-open="${esc(c.caseId)}">
                <span class="kind">${esc(KIND_LABEL[c.kind] || 'Case')}</span>
                <span class="drawer-title">${esc(c.title)}</span>
                <span class="drawer-meta">${c.desk.length} widget${c.desk.length === 1 ? '' : 's'}${c.draftOpen ? ' · draft' : ''}</span>
              </button>
            </div>`;
          })
          .join('');

  const bulk =
    visible.length > 0
      ? `<div class="drawer-bulk">
          <label class="drawer-check drawer-check--all">
            <input type="checkbox" data-action="drawer-select-all" ${allVisibleSelected ? 'checked' : ''} />
            <span>Select all</span>
          </label>
          <button type="button" class="btn btn-outline" data-action="drawer-clear-selected" ${selectedCount === 0 ? 'disabled' : ''}>
            Clear selected${selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
        </div>`
      : '';

  return `<div class="drawer-backdrop" data-action="close-drawer" aria-hidden="true"></div>
    <div class="drawer-dropdown" role="dialog" aria-label="Drawer" data-stop>
      <div class="drawer-ranges" role="tablist">${rangeTabs}</div>
      ${custom}
      <div class="drawer-list">${rows}</div>
      ${bulk}
    </div>`;
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
        <button type="button" class="icon-btn" data-action="request-remove" data-table-id="${esc(table.id)}" aria-label="Remove panel">✕</button>
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

function residualInsightOnDesk(): InsightDeskObject | null {
  return (
    state.desk.find(
      (o): o is InsightDeskObject => o.kind === 'insight' && o.id === INSIGHT_RESIDUAL_ID,
    ) ?? null
  );
}

function renderSectionDeskObject(
  sectionObj: SectionDeskObject,
  opts?: { besideInsight?: boolean },
): string {
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
    showRemove: true,
    besideInsight: opts?.besideInsight,
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
  const sections = sectionObjects();
  const residual = residualInsightOnDesk();
  const otherInsights = state.desk.filter(
    (o): o is InsightDeskObject => o.kind === 'insight' && o.id !== INSIGHT_RESIDUAL_ID,
  );
  const primaryTables = state.desk.filter(
    (o): o is TableDeskObject => o.kind === 'table' && !o.title,
  );
  const panes = state.desk.filter((o): o is TableDeskObject => o.kind === 'table' && !!o.title);

  let focusHtml = '';
  if (sections.length === 1 && residual) {
    focusHtml = `<div class="desk-split-row desk-split-row--focus">
      ${renderSectionDeskObject(sections[0]!, { besideInsight: true })}
      ${renderInsightWidget(residual, {
        flash: state.flash === 'residual',
        showRemove: true,
        interactiveLinks: true,
      })}
    </div>`;
  } else {
    focusHtml =
      sections.map((s) => renderSectionDeskObject(s)).join('') +
      (residual
        ? renderInsightWidget(residual, {
            flash: state.flash === 'residual',
            showRemove: true,
            interactiveLinks: true,
          })
        : '');
  }

  const insightsHtml = otherInsights.map((o) => renderDeskObject(o)).join('');
  const tablesHtml = primaryTables.map((o) => renderTableObject(o)).join('');
  const panesHtml =
    panes.length > 0
      ? `<div class="desk-split-row">${panes.map((o) => renderTableObject(o)).join('')}</div>`
      : '';
  return `<div class="desk-composition">${focusHtml}${insightsHtml}${tablesHtml}${panesHtml}</div>`;
}

function renderMessage(m: Message): string {
  const msgIdx = state.messages.indexOf(m);
  const inner = m.parts
    .map((p, partIdx) => {
      if (p.type === 'text') return `<span class="bubble-text">${esc(p.text)}</span>`;
      if (p.type === 'calc') {
        const menuOpen =
          !!p.apply && state.chipMenu?.msg === msgIdx && state.chipMenu.part === partIdx;
        const menu =
          menuOpen
            ? `<div class="chip-menu" role="menu">
                <button type="button" class="chip-menu-item" role="menuitem" data-chip-add-desk data-chip-msg="${msgIdx}" data-chip-part="${partIdx}">Add to desk</button>
              </div>`
            : '';
        if (!p.apply) {
          return `<div class="chat-calc-chip" aria-label="Calculation">
            ${renderCalculationBlock(p.calc, { compact: true })}
          </div>`;
        }
        return `<span class="readout-chip-wrap chat-calc-wrap">
          <button type="button" class="chat-calc-chip${menuOpen ? ' is-open' : ''}" data-chip-msg="${msgIdx}" data-chip-part="${partIdx}" aria-haspopup="menu" aria-expanded="${menuOpen}" title="Actions">
            ${renderCalculationBlock(p.calc, { compact: true })}
          </button>
          ${menu}
        </span>`;
      }
      if (!p.apply) {
        return `<span class="readout-chip readout-chip--static" title="${esc(p.label)}">
          <span class="readout-chip-label">${esc(p.label)}</span>
          <span class="readout-chip-value">${esc(p.value)}</span>
        </span>`;
      }
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

function renderDraftPanel(): string {
  if (!state.draftOpen) return '';
  const sent = state.draftSent;
  const title = sent
    ? `<span class="draft-status-pill">Query sent</span>`
    : `<strong>Draft query</strong>`;
  const actions = sent
    ? `<button type="button" class="btn" data-action="review-draft">Review</button>`
    : `<button type="button" class="btn primary" data-action="send-draft">Send</button>
       <button type="button" class="btn" data-action="cancel-draft">Cancel</button>`;
  return `<div class="draft-panel${sent ? ' is-sent' : ''}" data-desk-widget="draft">
    <div class="draft-panel-head">
      ${title}
      <button type="button" class="icon-btn" data-action="cancel-draft" aria-label="Dismiss draft">✕</button>
    </div>
    <textarea class="draft-body" data-draft-body maxlength="2000" rows="3" ${sent ? 'readonly' : ''}>${esc(state.draftBody)}</textarea>
    <div class="draft-footer">${actions}</div>
  </div>`;
}

function renderToast(): string {
  if (!state.toast) return '';
  const undo = state.draftUndo
    ? `<button type="button" class="toast-undo" data-action="undo-dismiss">Undo</button>`
    : '';
  return `<div class="desk-toast" role="status">
    <span>${esc(state.toast.message)}</span>
    ${undo}
  </div>`;
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

function renderDeskSurface(): string {
  if (state.deskMode === 'roster') {
    const sortByUrgency = state.homeSort === 'urgency';
    const sortLabel = sortByUrgency
      ? 'Sorted by urgency — click to sort by date added'
      : 'Sorted by date added — click to sort by urgency';
    return `<div class="desk-roster">
      <header class="roster-hero">
        <h1>Good morning, ${esc(USER_NAME)}</h1>
        <div class="date">${esc(TODAY)}</div>
      </header>
      <div class="home-lead-row">
        <p class="home-lead">Open issues — focusing one parks the rest in the drawer.</p>
        <button type="button" class="icon-btn home-sort-btn" data-action="toggle-home-sort" aria-label="${esc(sortLabel)}" title="${esc(sortLabel)}">
          ${sortByUrgency ? iconSortUrgency() : iconSortDate()}
        </button>
      </div>
      <div class="attention-list">${renderRosterCards()}</div>
    </div>`;
  }

  const item = currentItem();
  if (!item) {
    state.deskMode = 'roster';
    return renderDeskSurface();
  }
  const draft = renderDraftPanel();
  return `<div class="case-banner">
      <span class="kind">${esc(KIND_LABEL[item.kind] || 'Case')}</span>
      <div class="case-banner-copy">
        <h2>${esc(item.title)}</h2>
        <span class="meta">${esc(item.detail)}</span>
      </div>
    </div>
    ${renderDesk()}
    ${draft}`;
}

function renderCaseActions(): string {
  const focusActions =
    state.deskMode === 'focus'
      ? `<div class="case-actions-end">
          <button type="button" class="btn btn-outline btn-outline-bright" data-action="next-issue">Next issue</button>
          <button type="button" class="btn btn-outline btn-outline-bright" data-action="full-record">View full statement</button>
          <button type="button" class="btn primary" data-action="draft">Draft query</button>
        </div>`
      : `<div class="case-actions-end"></div>`;
  return `<div class="case-actions">
    <button type="button" class="btn btn-outline btn-outline-bright" data-action="all-issues"${
      state.deskMode === 'roster' ? ' disabled' : ''
    }>All issues</button>
    ${focusActions}
  </div>`;
}

function renderApp(): string {
  const table = primaryTable();
  const tid = caseTreatyId();
  const obj = tid ? TREATIES[tid] ?? null : null;
  const drawerCount = state.drawer.length;

  const full = state.fullRecord
    ? `<div class="full-record" data-action="close-full">
        <div class="full-record-card" data-stop>
          <h2>${esc(obj?.label ?? 'Record')}</h2>
          <p>Canonical host for this data object — same tabs and tables, full chrome.</p>
          <button type="button" class="btn primary" data-action="close-full">Back to desk</button>
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
            <span class="desk-mode-label">${state.deskMode === 'roster' ? 'Desk' : 'Focus'}</span>
            <div class="drawer-anchor">
              <button type="button" class="icon-btn drawer-toggle${state.drawerOpen ? ' is-open' : ''}${drawerCount > 0 ? ' has-items' : ''}" data-action="toggle-drawer" aria-expanded="${state.drawerOpen}" aria-haspopup="dialog" aria-label="Drawer${drawerCount > 0 ? `, ${drawerCount} items` : ''}" title="Drawer">
                ${iconDrawer()}
                ${drawerCount > 0 ? `<span class="drawer-count">${drawerCount}</span>` : ''}
              </button>
              ${renderDrawerDropdown()}
            </div>
          </div>
          <div class="desk-scroll">
            ${renderDeskSurface()}
          </div>
          ${renderCaseActions()}
        </section>
      </div>
    </main>
    ${renderThread()}
    ${modals}
    ${full}
    ${renderToast()}
  </div>`;
}

function render(): void {
  app.innerHTML = renderApp();
  bind();
  if (pendingDeskScroll && state.deskMode === 'focus') {
    pendingDeskScroll = false;
    scrollDeskToLatest();
  }
}

function bind(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = ATTENTION.find((a) => a.id === btn.dataset.open);
      if (item) {
        state.drawerOpen = false;
        focusIssue(item);
      }
    });
  });

  app.querySelectorAll<HTMLInputElement>('[data-drawer-select]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.drawerSelect!;
      if (input.checked) {
        if (!state.drawerSelected.includes(id)) state.drawerSelected = [...state.drawerSelected, id];
      } else {
        state.drawerSelected = state.drawerSelected.filter((x) => x !== id);
      }
      render();
    });
  });

  app.querySelectorAll<HTMLInputElement>('[data-drawer-from]').forEach((input) => {
    input.addEventListener('change', () => {
      state.drawerCustomFrom = input.value;
      render();
    });
  });
  app.querySelectorAll<HTMLInputElement>('[data-drawer-to]').forEach((input) => {
    input.addEventListener('change', () => {
      state.drawerCustomTo = input.value;
      render();
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
      if (action === 'all-issues' || action === 'home') {
        showRoster();
        return;
      }
      if (action === 'next-issue') {
        focusNextIssue();
        return;
      }
      if (action === 'toggle-drawer') {
        state.drawerOpen = !state.drawerOpen;
        if (!state.drawerOpen) state.drawerSelected = [];
        render();
        return;
      }
      if (action === 'close-drawer') {
        state.drawerOpen = false;
        state.drawerSelected = [];
        render();
        return;
      }
      if (action === 'drawer-range') {
        const range = el.dataset.range as DrawerRange;
        if (range) state.drawerRange = range;
        render();
        return;
      }
      if (action === 'drawer-select-all') {
        const visible = filteredDrawerClusters();
        const allOn = visible.every((c) => state.drawerSelected.includes(c.caseId));
        if (allOn) {
          const drop = new Set(visible.map((c) => c.caseId));
          state.drawerSelected = state.drawerSelected.filter((id) => !drop.has(id));
        } else {
          const merge = new Set([...state.drawerSelected, ...visible.map((c) => c.caseId)]);
          state.drawerSelected = [...merge];
        }
        render();
        return;
      }
      if (action === 'drawer-clear-selected') {
        clearSelectedDrawerClusters();
        return;
      }
      if (action === 'drawer-remove') {
        const id = el.dataset.caseId;
        if (id) removeDrawerCluster(id);
        return;
      }
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
        state.demo.sawDraft = true;
        state.draftOpen = true;
        state.draftSent = false;
        markDeskScroll();
        render();
      }
      if (action === 'cancel-draft') {
        dismissDraftWidget();
        return;
      }
      if (action === 'undo-dismiss') {
        undoDismissDraft();
        return;
      }
      if (action === 'review-draft') {
        state.draftSent = false;
        render();
        const ta = app.querySelector<HTMLTextAreaElement>('[data-draft-body]');
        ta?.focus();
        return;
      }
      if (action === 'send-draft') {
        const ta = app.querySelector<HTMLTextAreaElement>('[data-draft-body]');
        if (ta) state.draftBody = ta.value;
        state.demo.sawDraft = true;
        state.draftOpen = true;
        state.draftSent = true;
        state.messages = [
          ...state.messages,
          msg('user', 'Sent the query draft.'),
          msg(
            'agent',
            'Query sent — marked under query. The draft stays on the desk. When you’re ready, All issues or Next issue parks this cluster in the drawer.',
          ),
        ];
        markDeskScroll();
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

  app.querySelectorAll<HTMLButtonElement>('[data-chip-msg]').forEach((btn) => {
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
      if ((part?.type === 'chip' || part?.type === 'calc') && part.apply) {
        applyDeskOp(part.apply);
      } else {
        state.chipMenu = null;
        render();
      }
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
