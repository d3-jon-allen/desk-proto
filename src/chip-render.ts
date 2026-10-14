import { esc } from './util.ts';

export interface ReadoutChipModel {
  label: string;
  value: string;
}

export interface ReadoutChipOptions {
  /** Show the Add to desk menu open. */
  menuOpen?: boolean;
  /** Interactive data attrs for desk chat. */
  interactive?: boolean;
  msgIdx?: number;
  partIdx?: number;
}

/** Chat readout chip — agent answer that can be pinned to the desk. */
export function renderReadoutChip(
  chip: ReadoutChipModel,
  opts: ReadoutChipOptions = {},
): string {
  const interactive = opts.interactive === true;
  const menuOpen = opts.menuOpen === true;
  const msg = opts.msgIdx ?? 0;
  const part = opts.partIdx ?? 0;
  const dataAttrs = interactive
    ? ` data-chip-msg="${msg}" data-chip-part="${part}"`
    : '';
  const menu = menuOpen
    ? `<div class="chip-menu" role="menu">
        <button type="button" class="chip-menu-item" role="menuitem"${
          interactive ? ` data-chip-add-desk data-chip-msg="${msg}" data-chip-part="${part}"` : ' disabled'
        }>Add to desk</button>
      </div>`
    : '';

  return `<span class="readout-chip-wrap">
    <button type="button" class="readout-chip${menuOpen ? ' is-open' : ''}"${dataAttrs} aria-haspopup="menu" aria-expanded="${menuOpen}" title="Actions">
      <span class="readout-chip-label">${esc(chip.label)}</span>
      <span class="readout-chip-value">${esc(chip.value)}</span>
    </button>
    ${menu}
  </span>`;
}

/** Chip sitting in a chat bubble for gallery context. */
export function renderReadoutChipInBubble(
  text: string,
  chip: ReadoutChipModel,
  opts: ReadoutChipOptions = {},
): string {
  return `<div class="bubble agent">
    <span class="bubble-text">${esc(text)}</span>
    ${renderReadoutChip(chip, opts)}
  </div>`;
}
