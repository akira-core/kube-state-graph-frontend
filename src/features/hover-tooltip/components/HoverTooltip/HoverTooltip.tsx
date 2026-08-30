import React, { useLayoutEffect, useRef, useState } from 'react';

import { PROMOTED_LABEL_KEYS, buildNodeAttributes } from '../../../../shared/nodeAttributes/buildNodeAttributes';
import {
  formatDurationMs,
  formatErrorRate,
  formatLatencyUs,
  formatOps,
  formatRate,
  formatThroughputBytesPerSec,
} from '../../formatEdgeMetrics';
import { useHoverElement, type HoveredElement } from '../../hooks/useHoverElement';

import { type HoverTooltipProps } from './HoverTooltip.types';

interface TooltipRow {
  key: string;
  value: string;
  // Wrap instead of clip — for long values like a formatted usage reading or a long label.
  wrap?: boolean;
  // Renders the value in the theme's error colour. Only the value is tinted (the key stays
  // secondary) so the row still scans as part of the same list.
  danger?: boolean;
}

// Promoted attrs (kind/namespace/ipAddress, or edgeType) + raw backend `labels`
// below a divider. Labels are unfiltered — the backend decides what to send.
interface TooltipContent {
  title: string;
  attrs: TooltipRow[];
  labels: TooltipRow[];
}

const STYLES = {
  root: 'absolute z-10 w-[280px] overflow-x-hidden overflow-y-auto rounded border border-weak bg-surface p-2 text-xs leading-snug text-primary shadow opacity-90',
  title: 'mb-1 overflow-hidden text-ellipsis whitespace-nowrap font-semibold',
  row: 'flex gap-1 whitespace-nowrap',
  rowKey: 'text-secondary',
  dangerValue: 'text-[var(--ksg-status-error)]',
  labelRow: 'flex gap-1 break-all',
  labelsHint: 'mt-1 text-[10px] uppercase tracking-wide text-muted',
};

// String entries of a labels map as rows, skipping keys already promoted to attrs.
function toLabelRows(labels: unknown, promoted: ReadonlySet<string>): TooltipRow[] {
  if (labels === null || typeof labels !== 'object') {
    return [];
  }
  const rows: TooltipRow[] = [];
  for (const [key, value] of Object.entries(labels as Record<string, unknown>)) {
    if (promoted.has(key)) {
      continue;
    }
    if (typeof value === 'string') {
      rows.push({ key, value });
    }
  }
  return rows;
}

const NODE_PROMOTED_LABELS: ReadonlySet<string> = new Set(['namespace', ...PROMOTED_LABEL_KEYS]);
const EDGE_PROMOTED_LABELS: ReadonlySet<string> = new Set<string>();

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// Measurement rows for an edge the backend measured (`data.metrics`). They sit among the
// promoted attrs — NOT under the `labels` divider, which is reserved for what the backend
// sent verbatim as labels (and the backend forbids these values as label keys).
//
// `metrics` is a union of two mutually exclusive families: RED on a trace-derived call
// edge, I/O on a `pvc-to-netapp-aggr` storage edge. `rate` discriminates them — it is
// required within the RED family and absent from the I/O one — so an object without a
// usable `rate` is tried as I/O rather than discarded, mirroring normalize's own ordering.
//
// Each optional field is rendered only when present. An absent `errorRate` means the
// failure counter could not be read, which is NOT the measured-and-clean `0` the backend
// also emits — so it MUST render as no row at all rather than as `0%`. The same holds for
// every I/O field: each rides its own upstream series family.
//
// `HoveredElement.data` is a bare `Record<string, unknown>`, so this narrows at its own
// boundary the way `toLabelRows` does, rather than trusting a cast. normalize has already
// validated the shape; this is the same belt-and-braces the labels path uses.
function buildMetricRows(metrics: unknown): TooltipRow[] {
  if (metrics === null || typeof metrics !== 'object') {
    return [];
  }
  const { rate, errorRate, p90ServerMs } = metrics as Partial<cytoscape.EdgeRedMetrics>;
  if (!isFiniteNumber(rate)) {
    return buildIoMetricRows(metrics);
  }
  const rows: TooltipRow[] = [{ key: 'rate', value: formatRate(rate) }];
  if (isFiniteNumber(errorRate)) {
    // A measured `0` is the clean case and stays neutral; anything above it is a real
    // failure fraction, so the value is tinted. `danger` keys off the number, not the
    // formatted string — a tiny rate renders as `0.0000067%` but is still non-zero.
    rows.push({ key: 'errorRate', value: formatErrorRate(errorRate), danger: errorRate !== 0 });
  }
  if (isFiniteNumber(p90ServerMs)) {
    rows.push({ key: 'duration(p90)', value: formatDurationMs(p90ServerMs) });
  }
  return rows;
}

// The I/O half of the union, in read-then-write order so each pair reads as a block:
// ops, then latency, then throughput. Values are Harvest's verbatim per-second ops,
// average microsecond latencies, and bytes-per-second rates.
function buildIoMetricRows(metrics: object): TooltipRow[] {
  const {
    readOps,
    writeOps,
    readLatencyUs,
    writeLatencyUs,
    readBytesPerSec,
    writeBytesPerSec,
    maxIops,
    maxBytesPerSec,
  } = metrics as Partial<cytoscape.EdgeIoMetrics>;
  const rows: TooltipRow[] = [];
  if (isFiniteNumber(readOps)) {
    rows.push({ key: 'read', value: formatOps(readOps) });
  }
  if (isFiniteNumber(writeOps)) {
    rows.push({ key: 'write', value: formatOps(writeOps) });
  }
  if (isFiniteNumber(readLatencyUs)) {
    rows.push({ key: 'read latency', value: formatLatencyUs(readLatencyUs) });
  }
  if (isFiniteNumber(writeLatencyUs)) {
    rows.push({ key: 'write latency', value: formatLatencyUs(writeLatencyUs) });
  }
  if (isFiniteNumber(readBytesPerSec)) {
    rows.push({ key: 'read throughput', value: formatThroughputBytesPerSec(readBytesPerSec) });
  }
  if (isFiniteNumber(writeBytesPerSec)) {
    rows.push({ key: 'write throughput', value: formatThroughputBytesPerSec(writeBytesPerSec) });
  }
  // The declared ceilings close the block, each routed through the SAME formatter as the
  // reading it caps so the two are comparable at a glance. Deliberately uncoloured even
  // when a reading exceeds one: ONTAP throttles rather than fails, and the error tint is
  // reserved for a measured RED errorRate.
  if (isFiniteNumber(maxIops)) {
    rows.push({ key: 'max iops', value: formatOps(maxIops) });
  }
  if (isFiniteNumber(maxBytesPerSec)) {
    rows.push({ key: 'max throughput', value: formatThroughputBytesPerSec(maxBytesPerSec) });
  }
  return rows;
}

function buildContent(hovered: HoveredElement): TooltipContent {
  const { data, group } = hovered;
  if (group === 'nodes') {
    const labelRaw = data.label;
    const idRaw = data.id;
    const title = typeof labelRaw === 'string' ? labelRaw : typeof idRaw === 'string' ? idRaw : '';
    // Promoted attrs come from the single shared source (also feeds the pinned top-right
    // card); raw backend `labels` follow below the divider.
    const attrs: TooltipRow[] = buildNodeAttributes(data);
    return { title, attrs, labels: toLabelRows(data.labels, NODE_PROMOTED_LABELS) };
  }

  const title = `${hovered.sourceLabel ?? ''} → ${hovered.targetLabel ?? ''}`;
  const attrs: TooltipRow[] = [];
  if (typeof data.edgeType === 'string') {
    attrs.push({ key: 'edgeType', value: data.edgeType });
  }
  attrs.push(...buildMetricRows(data.metrics));
  return { title, attrs, labels: toLabelRows(data.labels, EDGE_PROMOTED_LABELS) };
}

// Anchor-to-box gap and min distance kept from canvas edges when clamping.
const TOOLTIP_OFFSET = 14;
const EDGE_MARGIN = 4;
// Fallback when no rendered position is available.
const FALLBACK_COORDS = { left: EDGE_MARGIN, top: EDGE_MARGIN };

// Pinned mode overrides (left-click selection): dock top-right *below* the always-visible
// SearchBar (design D7 / graph-search). Keep top in sync with SearchBar's
// PINNED_TOOLTIP_TOP_BELOW_SEARCH_PX (8 + 36 + 8). zIndex 1000 clears cytoscape's
// transparent expand-collapse input canvas (z 999) so a pointer-events:auto card
// receives scroll/clicks (styles.root's z 10 only works because hover is
// pointer-events:none). SearchBar uses z 1001 so the input stays above this card.
const PINNED_STYLE: React.CSSProperties = {
  left: 'auto',
  right: 8,
  top: 52,
  maxHeight: 'calc(50% - 60px)',
  pointerEvents: 'auto',
  zIndex: 1000,
};

// Shared row render for both modes — title + promoted attrs + a `labels` divider and rows.
function renderRows(content: TooltipContent, styles: typeof STYLES): React.JSX.Element {
  const { title, attrs, labels } = content;
  return (
    <>
      <div className={styles.title}>{title}</div>
      {attrs.map((row) => (
        <div key={row.key} className={row.wrap === true ? styles.labelRow : styles.row}>
          <span className={styles.rowKey}>{row.key}:</span>
          <span className={row.danger === true ? styles.dangerValue : undefined}>{row.value}</span>
        </div>
      ))}
      {labels.length > 0 && (
        <div className={styles.labelsHint} data-testid="hover-tooltip-labels-divider">
          labels
        </div>
      )}
      {labels.map((row) => (
        <div key={row.key} className={styles.labelRow}>
          <span className={styles.rowKey}>{row.key}:</span>
          <span>{row.value}</span>
        </div>
      ))}
    </>
  );
}

export function HoverTooltip(props: Readonly<HoverTooltipProps>): React.JSX.Element | null {
  const { cyRef, ready = false, pinned } = props;
  const styles = STYLES;
  const hovered = useHoverElement({ cyRef, ready });
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number }>(FALLBACK_COORDS);

  // Place beside the anchor, clamp/flip inside the canvas. useLayoutEffect runs
  // before paint so the corrected position shows on frame 1 (no flash at the fallback corner).
  // While pinned, skip entirely: the pinned card uses fixed coords and the hover div is
  // unmounted (ref null), so running would clobber the last-good coords to FALLBACK and
  // park the hover tooltip at the top-left corner on the next un-pin. `pinned` is a dep so
  // coords recompute on the un-pin edge (the hover div has remounted → ref is live).
  useLayoutEffect(() => {
    if (pinned != null) {
      return;
    }
    const el = ref.current;
    if (el === null || hovered === null || hovered.position === undefined) {
      setCoords(FALLBACK_COORDS);
      return;
    }
    const { position } = hovered;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = hovered.viewport?.width ?? position.x + w + TOOLTIP_OFFSET + EDGE_MARGIN;
    const vh = hovered.viewport?.height ?? position.y + h + TOOLTIP_OFFSET + EDGE_MARGIN;

    let left = position.x + TOOLTIP_OFFSET;
    if (left + w > vw - EDGE_MARGIN) {
      left = position.x - TOOLTIP_OFFSET - w; // flip to the element's left
    }
    left = Math.max(EDGE_MARGIN, Math.min(left, vw - w - EDGE_MARGIN));

    let top = position.y + TOOLTIP_OFFSET;
    if (top + h > vh - EDGE_MARGIN) {
      top = position.y - TOOLTIP_OFFSET - h; // flip above the element
    }
    top = Math.max(EDGE_MARGIN, Math.min(top, vh - h - EDGE_MARGIN));

    setCoords({ left, top });
  }, [hovered, pinned]);

  // Pinned mode wins and is independent of `hovered`/`ready`: the card must show
  // even when nothing is under the cursor, and hover is suppressed while pinned.
  // This branch MUST precede the `hovered === null` guard below.
  if (pinned != null) {
    return (
      <div className={styles.root} style={PINNED_STYLE} data-testid="hover-tooltip" data-pinned="true" role="tooltip">
        {renderRows(
          { title: pinned.label, attrs: pinned.attributes, labels: toLabelRows(pinned.labels, NODE_PROMOTED_LABELS) },
          styles
        )}
      </div>
    );
  }

  if (hovered === null) {
    return null;
  }

  const content = buildContent(hovered);

  // Cap to the canvas so an oversized tooltip scrolls within bounds instead of spilling over.
  const vp = hovered.viewport;
  const sizeStyle =
    vp !== undefined
      ? { maxWidth: Math.max(0, vp.width - 2 * EDGE_MARGIN), maxHeight: Math.max(0, vp.height - 2 * EDGE_MARGIN) }
      : {};

  return (
    <div
      ref={ref}
      className={styles.root}
      style={{ left: coords.left, top: coords.top, ...sizeStyle }}
      data-testid="hover-tooltip"
      role="tooltip"
    >
      {renderRows(content, styles)}
    </div>
  );
}
