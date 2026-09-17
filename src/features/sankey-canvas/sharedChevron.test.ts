import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// sankey-canvas spec, "Ribbon end chevron": one geometry function and one drawing primitive,
// defined here and imported by both charts. A structural rule, so it is checked against the
// source text.
const FEATURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourcesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__snapshots__') {
        sourcesUnder(full, out);
      }
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const read = (relative: string): string => fs.readFileSync(path.join(FEATURES, relative), 'utf8');

describe('Both views share one chevron', () => {
  const sources = sourcesUnder(FEATURES).map((file) => ({
    file: path.relative(FEATURES, file),
    text: fs.readFileSync(file, 'utf8'),
  }));

  it('defines the path geometry and the drawing primitive once, in sankey-canvas', () => {
    const pathDefinitions = sources.filter(({ text }) => /export function endChevronPath\b/.test(text));
    expect(pathDefinitions.map((s) => s.file)).toEqual(['sankey-canvas/geometry.ts']);
    const primitiveDefinitions = sources.filter(({ text }) => /export function RibbonChevron\b/.test(text));
    expect(primitiveDefinitions.map((s) => s.file)).toEqual(['sankey-canvas/RibbonChevron.tsx']);
    // No chart keeps a chevron of its own beside the shared one.
    const ownChevrons = sources.filter(
      ({ file, text }) => !file.startsWith('sankey-canvas/') && /function \w*Chevron\w*\s*\(/.test(text)
    );
    expect(ownChevrons.map((s) => s.file)).toEqual(['network-trace/layout/paths.ts']);
    expect(read('network-trace/layout/paths.ts')).toMatch(/return endChevronPath\(/);
  });

  it('is imported by the storage chart and by the network chart', () => {
    expect(read('storage-flow-sankey/layoutSankey.ts')).toMatch(/\bendChevronPath\b[\s\S]*from '\.\.\/sankey-canvas'/);
    expect(read('storage-flow-sankey/SankeyChart.tsx')).toMatch(/\bRibbonChevron\b[\s\S]*from '\.\.\/sankey-canvas'/);
    expect(read('network-trace/layout/paths.ts')).toMatch(
      /import \{[^}]*\bendChevronPath\b[^}]*\} from '\.\.\/\.\.\/sankey-canvas'/
    );
    expect(read('network-trace/chart/TraceBand.tsx')).toMatch(
      /import \{[^}]*\bRibbonChevron\b[^}]*\} from '\.\.\/\.\.\/sankey-canvas'/
    );
  });
});
