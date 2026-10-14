/**
 * Desk composition — one or more objects on the case work surface.
 */

import { defaultViewState, type ViewState } from './data.ts';
import type { InsightWidget } from './insight.ts';
import type { ViewId } from './schema.ts';

export type { InsightWidget };
export type InsightDeskObject = InsightWidget;

export {
  INSIGHT_OP_CATALOG,
  INSIGHT_RESIDUAL_ID,
  residualInsightMetrics,
  residualInsightPeers,
  residualInsightTor,
  type InsightBlock,
  type InsightLayout,
  type InsightOp,
  type InsightOpType,
  type InsightSubject,
} from './insight.ts';

export type DeskLayout = 'stack' | 'split';

export interface TableDeskObject {
  id: string;
  kind: 'table';
  treatyId: string;
  /** Short title override in split layout (e.g. "Signed lines"). */
  title?: string;
  view: ViewState;
}

/**
 * Single-section focus object — treaty is context (tags), not the frame.
 * Used when a query resolves to one section rather than the treaty collection.
 */
export interface SectionDeskObject {
  id: string;
  kind: 'section';
  treatyId: string;
  /** Section key as in TreatyObject.sections (e.g. "A - EU"). */
  section: string;
  /** Emphasize Due when the residual is in focus. */
  highlightDue?: boolean;
}

export type DeskObject = TableDeskObject | SectionDeskObject | InsightWidget;

/** Deterministic mutation applied from chat chips or agent intents. */
export type DeskOp =
  | { type: 'highlight-residual'; tableId?: string }
  | { type: 'focus-section'; treatyId: string; section: string; highlightDue?: boolean }
  | { type: 'show-residual-insight'; tableId?: string; peers?: boolean }
  | { type: 'clear-filters'; tableId?: string }
  | { type: 'show-all'; tableId?: string }
  | {
      type: 'set-threshold';
      viewId: ViewId;
      key: string;
      op: '>' | '<' | '>=' | '<=';
      value: number;
      tableId?: string;
    };

export function createTableObject(
  treatyId: string,
  opts?: { id?: string; title?: string; view?: ViewState },
): TableDeskObject {
  return {
    id: opts?.id ?? `table-${treatyId}`,
    kind: 'table',
    treatyId,
    title: opts?.title,
    view: opts?.view ?? defaultViewState(treatyId),
  };
}

export function createSectionObject(
  treatyId: string,
  section: string,
  opts?: { id?: string; highlightDue?: boolean },
): SectionDeskObject {
  const slug = section.replace(/\s+/g, '-').toLowerCase();
  return {
    id: opts?.id ?? `section-${treatyId}-${slug}`,
    kind: 'section',
    treatyId,
    section,
    highlightDue: opts?.highlightDue,
  };
}

function cloneColumns(src: ViewState['columnsByView']): ViewState['columnsByView'] {
  const out = {} as ViewState['columnsByView'];
  for (const k of Object.keys(src) as ViewId[]) out[k] = new Set(src[k]);
  return out;
}

function cloneFilters(src: ViewState['filtersByView']): ViewState['filtersByView'] {
  const out = {} as ViewState['filtersByView'];
  for (const k of Object.keys(src) as ViewId[]) {
    const dims = src[k];
    const next: ViewState['filtersByView'][ViewId] = {};
    for (const dim of Object.keys(dims)) next[dim] = new Set(dims[dim]);
    out[k] = next;
  }
  return out;
}

export function cloneViewForTab(base: ViewState, tab: ViewId): ViewState {
  const enabled = new Set(base.enabledViews);
  enabled.add(tab);
  return {
    ...base,
    tab,
    enabledViews: enabled,
    section: null,
    exploredPeers: true,
    columnsByView: cloneColumns(base.columnsByView),
    filtersByView: cloneFilters(base.filtersByView),
    dateRangeByView: { ...base.dateRangeByView },
    thresholdsByView: {
      sections: [...base.thresholdsByView.sections],
      'signed-lines': [...base.thresholdsByView['signed-lines']],
      contracts: [...base.thresholdsByView.contracts],
      statements: [...base.thresholdsByView.statements],
    },
  };
}
