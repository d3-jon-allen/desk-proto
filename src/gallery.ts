import './style.css';
import './gallery.css';
import { renderReadoutChip, renderReadoutChipInBubble } from './chip-render.ts';
import {
  ATTENTION,
  TREATIES,
  defaultViewState,
  type AttentionItem,
} from './data.ts';
import {
  cloneViewForTab,
  createTableObject,
  type TableDeskObject,
} from './desk.ts';
import {
  commissionTrueUpInsight,
  lossRatioInsight,
  premiumCapInsight,
  residualInsightMetrics,
  residualInsightPeers,
  residualInsightTor,
  type InsightWidget,
} from './insight.ts';
import { renderInsightWidget } from './insight-render.ts';
import { renderAttentionCard } from './issue-render.ts';
import { renderObjectWidget } from './object-render.ts';
import { esc } from './util.ts';

type GallerySectionId = 'issue' | 'object' | 'insight' | 'chip';

interface GalleryStory {
  id: string;
  title: string;
  blurb: string;
  html: string;
}

interface GallerySection {
  id: GallerySectionId;
  label: string;
  lead: string;
  stories: GalleryStory[];
}

const TOR = TREATIES['tor-qs-2025']!;

function objectSections(): TableDeskObject {
  const view = defaultViewState('tor-qs-2025');
  view.highlightDue = true;
  return createTableObject('tor-qs-2025', { id: 'gallery-sections', view });
}

function objectEmpty(): TableDeskObject {
  const view = defaultViewState('tor-qs-2025');
  view.section = 'B - UK';
  view.filtersByView.sections = {
    ...view.filtersByView.sections,
    status: new Set(['Open']),
  };
  return createTableObject('tor-qs-2025', { id: 'gallery-empty', view });
}

function objectSignedPane(): TableDeskObject {
  return createTableObject('tor-qs-2025', {
    id: 'gallery-signed',
    title: 'Signed lines',
    view: cloneViewForTab(defaultViewState('tor-qs-2025'), 'signed-lines'),
  });
}

function objectContractsLr(): TableDeskObject {
  const view = cloneViewForTab(defaultViewState('tor-qs-2025'), 'contracts');
  view.columnsByView.contracts = new Set([
    ...view.columnsByView.contracts,
    'lossRatio',
  ]);
  view.thresholdsByView.contracts = [{ key: 'lossRatio', op: '>', value: 10 }];
  return createTableObject('tor-qs-2025', { id: 'gallery-contracts-lr', view });
}

function objectMultiTab(): TableDeskObject {
  const view = defaultViewState('tor-qs-2025');
  view.enabledViews = new Set(['sections', 'signed-lines', 'contracts']);
  view.highlightDue = true;
  return createTableObject('tor-qs-2025', { id: 'gallery-tabs', view });
}

function renderInsightStory(widget: InsightWidget): string {
  return renderInsightWidget(widget, { showRemove: false, interactiveLinks: false });
}

function renderObjectStory(table: TableDeskObject): string {
  return renderObjectWidget(table, TOR, {
    showSettings: true,
    showRemove: !!table.title,
    showEmptyActions: true,
  });
}

const SECTIONS: GallerySection[] = [
  {
    id: 'issue',
    label: 'Issue',
    lead: 'Attention home cards — case entry points into a desk object.',
    stories: ATTENTION.map((item: AttentionItem) => ({
      id: `issue-${item.id}`,
      title: KIND_TITLE(item),
      blurb: item.detail,
      html: `<div class="gallery-issue-list">${renderAttentionCard(item, { interactive: false })}</div>`,
    })),
  },
  {
    id: 'object',
    label: 'Object',
    lead: 'Entity-tethered table card — tabs, filters, empty recovery, split panes.',
    stories: [
      {
        id: 'object-sections',
        title: 'Sections · residual highlight',
        blurb: 'Default TOR projection — full chrome, Due emphasized.',
        html: renderObjectStory(objectSections()),
      },
      {
        id: 'object-empty',
        title: 'Empty state',
        blurb: 'Open-only + pin away from A – EU — recovery actions.',
        html: renderObjectStory(objectEmpty()),
      },
      {
        id: 'object-pane',
        title: 'Split pane · Signed lines',
        blurb: 'Titled pane (side-by-side layout); no treaty chrome.',
        html: renderObjectStory(objectSignedPane()),
      },
      {
        id: 'object-threshold',
        title: 'Contracts · LR threshold',
        blurb: 'Measure threshold chip + filtered rows.',
        html: renderObjectStory(objectContractsLr()),
      },
      {
        id: 'object-tabs',
        title: 'Multi-tab',
        blurb: 'Several recipes enabled on one object.',
        html: renderObjectStory(objectMultiTab()),
      },
    ],
  },
  {
    id: 'insight',
    label: 'Insight',
    lead: 'Derived answer card — equation / metrics in structure, not prose.',
    stories: [
      {
        id: 'insight-residual',
        title: 'Residual / ITD',
        blurb: 'Pin from residual % chip — single subject, half-width card.',
        html: renderInsightStory(residualInsightTor()),
      },
      {
        id: 'insight-peers',
        title: 'Residual vs peers',
        blurb: 'Allianz compare — subjects side-by-side.',
        html: renderInsightStory(residualInsightPeers()),
      },
      {
        id: 'insight-metrics',
        title: 'Metrics only',
        blurb: 'Key numbers without a formula.',
        html: renderInsightStory(residualInsightMetrics()),
      },
      {
        id: 'insight-lr',
        title: 'Loss ratio',
        blurb: 'Contracts / threshold scenario shape.',
        html: renderInsightStory(lossRatioInsight()),
      },
      {
        id: 'insight-commission',
        title: 'Commission true-up',
        blurb: 'ART review scenario — delta calc.',
        html: renderInsightStory(commissionTrueUpInsight()),
      },
      {
        id: 'insight-cap',
        title: 'Premium / cap',
        blurb: 'PET watch scenario.',
        html: renderInsightStory(premiumCapInsight()),
      },
    ],
  },
  {
    id: 'chip',
    label: 'Readout chip',
    lead: 'Chat answer that can be pinned to the desk via Add to desk.',
    stories: [
      {
        id: 'chip-closed',
        title: 'Default',
        blurb: 'Residual % readout in an agent bubble.',
        html: `<div class="gallery-chat">
          ${renderReadoutChipInBubble('Due is highlighted on A – EU.', {
            label: 'Residual / section ITD',
            value: '3.2%',
          })}
        </div>`,
      },
      {
        id: 'chip-menu',
        title: 'Menu open',
        blurb: 'Add to desk affordance.',
        html: `<div class="gallery-chat">
          ${renderReadoutChipInBubble('Open the readout to pin Residual / ITD on the desk.', {
            label: 'Residual / section ITD',
            value: '3.2%',
          }, { menuOpen: true })}
        </div>`,
      },
      {
        id: 'chip-alone',
        title: 'Chip only',
        blurb: 'Without bubble chrome.',
        html: renderReadoutChip({ label: 'Filter', value: 'LR > 10%' }),
      },
    ],
  },
];

function KIND_TITLE(item: AttentionItem): string {
  return `${item.kind} · ${item.title}`;
}

function activeSectionId(): GallerySectionId {
  const hash = (location.hash || '#issue').replace(/^#/, '').split('/')[0];
  if (SECTIONS.some((s) => s.id === hash)) return hash as GallerySectionId;
  return 'issue';
}

function renderRail(active: GallerySectionId): string {
  return `<nav class="gallery-rail" aria-label="Components">
    <a class="gallery-back" href="/">← Desk</a>
    <p class="gallery-rail-label">Components</p>
    ${SECTIONS.map(
      (s) =>
        `<a class="gallery-rail-item${s.id === active ? ' is-active' : ''}" href="#${esc(s.id)}">${esc(s.label)}</a>`,
    ).join('')}
  </nav>`;
}

function renderStory(story: GalleryStory): string {
  return `<article class="gallery-story" id="${esc(story.id)}">
    <header class="gallery-story-head">
      <h2>${esc(story.title)}</h2>
      <p>${esc(story.blurb)}</p>
    </header>
    <div class="gallery-canvas">${story.html}</div>
  </article>`;
}

function renderSection(section: GallerySection): string {
  return `<div class="gallery-main">
    <header class="gallery-top">
      <h1>${esc(section.label)}</h1>
      <p class="gallery-lead">${esc(section.lead)}</p>
    </header>
    <div class="gallery-stories">${section.stories.map(renderStory).join('')}</div>
  </div>`;
}

function render(): void {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  const active = activeSectionId();
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]!;
  app.innerHTML = `<div class="gallery-shell">
    ${renderRail(active)}
    ${renderSection(section)}
  </div>`;
}

window.addEventListener('hashchange', render);
if (!location.hash) location.hash = '#issue';
render();
