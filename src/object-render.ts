/**
 * Object widget renderer — entity-tethered table card for desk + gallery.
 * Pure HTML; no app state.
 */

import type { TreatyObject, ViewState } from './data.ts';
import type { TableDeskObject } from './desk.ts';
import { TREATY_VIEW_CATALOG, recipe, type FieldDef } from './schema.ts';
import { esc } from './util.ts';

export interface ObjectRenderOptions {
  showSettings?: boolean;
  showRemove?: boolean;
  /** Highlight Due column (residual demo). */
  highlightDue?: boolean;
  /** Show empty-state recovery buttons (inert in gallery). */
  showEmptyActions?: boolean;
}

function cellClass(role: FieldDef['role'], extra?: string): string | undefined {
  const parts = [role === 'measure' ? 'num' : '', extra ?? ''].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

function td(html: string, className?: string): string {
  const cls = className ? ` class="${esc(className)}"` : '';
  return `<td${cls}><span class="cell-text">${html}</span></td>`;
}

function emptyState(colspan: number, noun: string, opts: ObjectRenderOptions): string {
  const actions =
    opts.showEmptyActions === false
      ? ''
      : `<div class="empty-actions">
        <button type="button" class="btn" disabled>Clear filters</button>
        <button type="button" class="btn primary" disabled>Show all</button>
      </div>`;
  return `<tr><td colspan="${colspan}" class="empty-cell">
    <div class="empty-state">
      <p class="empty-title">Nothing here matches those filters.</p>
      <p class="empty-copy">No ${esc(noun)} made it through. Clear your filters to reset the view, or show everything and start fresh.</p>
      ${actions}
    </div>
  </td></tr>`;
}

function filterToolbar(viewId: ViewState['tab'], view: ViewState): string {
  const thresholds = view.thresholdsByView[viewId] ?? [];
  const chips: string[] = [];
  if (viewId === 'sections' && view.section) {
    chips.push(
      `<label class="section-chip"><span class="section-chip-label">${esc(view.section)}</span></label>`,
    );
  }
  for (const t of thresholds) {
    chips.push(
      `<span class="threshold-chip">${esc(t.key)} ${esc(t.op)} ${t.value}${t.key === 'lossRatio' ? '%' : ''}</span>`,
    );
  }
  if (chips.length === 0) return '';
  return `<div class="table-toolbar">${chips.join('')}</div>`;
}

function renderSections(obj: TreatyObject, view: ViewState, opts: ObjectRenderOptions): string {
  const cols = recipe('sections').columns.filter((c) => view.columnsByView.sections.has(c.key));
  const statusOn = view.columnsByView.sections.has('status');
  const statusFilter = view.filtersByView.sections.status;
  let rows = obj.sections.filter((r) => {
    if (view.section && r.section !== view.section) return false;
    if (statusOn && statusFilter && statusFilter.size > 0 && !statusFilter.has(r.status)) {
      return false;
    }
    return true;
  });

  const body =
    rows.length === 0
      ? emptyState(Math.max(cols.length, 1), 'sections', opts)
      : rows
          .map((r) => {
            const cells = cols
              .map((c) => {
                const em =
                  c.key === 'due' && r.dueEmphasis && (opts.highlightDue ?? view.highlightDue)
                    ? 'em'
                    : undefined;
                const val =
                  c.key === 'section'
                    ? r.section
                    : c.key === 'status'
                      ? r.status
                      : c.key === 'itd'
                        ? r.itd
                        : c.key === 'previous'
                          ? r.previous
                          : c.key === 'due'
                            ? r.due
                            : '';
                return td(esc(val), cellClass(c.role, em));
              })
              .join('');
            return `<tr class="${r.status === 'Open' ? 'open' : ''}">${cells}</tr>`;
          })
          .join('');

  return `${filterToolbar('sections', view)}
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderSignedLines(obj: TreatyObject, view: ViewState): string {
  const cols = recipe('signed-lines').columns.filter((c) =>
    view.columnsByView['signed-lines'].has(c.key),
  );
  const rows = obj.signedLines.slice(0, 6);
  const body = rows
    .map((r) => {
      const cells = cols
        .map((c) => {
          const val = r[c.key as keyof typeof r];
          return td(esc(typeof val === 'string' ? val : '—'), cellClass(c.role));
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `${filterToolbar('signed-lines', view)}
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderContracts(obj: TreatyObject, view: ViewState, opts: ObjectRenderOptions): string {
  const cols = recipe('contracts').columns.filter((c) => view.columnsByView.contracts.has(c.key));
  const thresholds = view.thresholdsByView.contracts ?? [];
  const lr = thresholds.find((t) => t.key === 'lossRatio');
  let rows = obj.contracts;
  if (lr) {
    rows = rows.filter((r) => {
      if (lr.op === '>') return r.lossRatioPct > lr.value;
      if (lr.op === '>=') return r.lossRatioPct >= lr.value;
      if (lr.op === '<') return r.lossRatioPct < lr.value;
      return r.lossRatioPct <= lr.value;
    });
  }
  const body =
    rows.length === 0
      ? emptyState(Math.max(cols.length, 1), 'contracts', opts)
      : rows
          .map((r) => {
            const cells = cols
              .map((c) => {
                const val =
                  c.key === 'lossRatioPct' || c.key === 'lossRatio'
                    ? r.lossRatio
                    : (r[c.key as keyof typeof r] as string | undefined);
                return td(esc(val ?? '—'), cellClass(c.role));
              })
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');

  return `${filterToolbar('contracts', view)}
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

/** Render an Object desk card for gallery or desk. */
export function renderObjectWidget(
  table: TableDeskObject,
  obj: TreatyObject,
  opts: ObjectRenderOptions = {},
): string {
  const view = table.view;
  const tab = view.tab;
  const heading = table.title ?? obj.label;
  const showChrome = !table.title;
  const showSettings = opts.showSettings !== false;
  const showRemove = opts.showRemove === true;

  const tableBody =
    tab === 'sections'
      ? renderSections(obj, view, opts)
      : tab === 'signed-lines'
        ? renderSignedLines(obj, view)
        : tab === 'contracts'
          ? renderContracts(obj, view, opts)
          : `<p class="residual">Statements view</p>`;

  return `<section class="display-object${table.title ? ' is-pane' : ''}" data-table-id="${esc(table.id)}">
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
        ${
          showSettings
            ? `<button type="button" class="icon-btn" aria-label="Table settings" disabled>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.65 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.13.23.4.32.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.09.48 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>
          </svg>
        </button>`
            : ''
        }
        ${
          showRemove
            ? `<button type="button" class="icon-btn" aria-label="Remove panel" disabled>✕</button>`
            : ''
        }
      </div>
    </div>
    ${
      showChrome
        ? `<div class="residual">
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
            `<button type="button" role="tab" class="view-tab${tab === v.id ? ' active' : ''}" aria-selected="${tab === v.id}" disabled>${esc(v.label)}</button>`,
        )
        .join('')}
    </div>`
        : ''
    }
    ${tableBody}
  </section>`;
}
