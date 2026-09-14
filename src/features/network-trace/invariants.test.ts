import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The port's structural rules, checked against the source text rather than the running
 * code: colours come from theme tokens (no literal hex), styling from Tailwind classes
 * (no stylesheet), sankey-panel's class vocabulary did not come across, and the leading
 * `+` on an amount is `formatDeltaBps`'s alone.
 */
const ROOT = path.dirname(fileURLToPath(import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__snapshots__') {
        walk(full, out);
      }
      continue;
    }
    out.push(full);
  }
  return out;
}

const ALL_FILES = walk(ROOT);
const SOURCE_FILES = ALL_FILES.filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function rel(file: string): string {
  return path.relative(ROOT, file);
}

describe('network-trace invariants', () => {
  it('scans a real set of source files', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(20);
    expect(SOURCE_FILES.map(rel)).toEqual(expect.arrayContaining(['TraceView.tsx', 'chart/TraceCards.tsx']));
  });

  it('carries no hex colour literal outside tests — colours are theme tokens', () => {
    const offenders = SOURCE_FILES.filter((f) => /#[0-9a-f]{3,8}\b/i.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('ships no stylesheet of its own', () => {
    expect(ALL_FILES.filter((f) => f.endsWith('.css')).map(rel)).toEqual([]);
  });

  it('uses none of sankey-panel’s class names', () => {
    const banned = ['leaf-stop', 'n-title', 'zoom-layer', 'chart-focus'];
    const offenders = ALL_FILES.filter((f) => !/\.test\.(ts|tsx)$/.test(f)).flatMap((f) => {
      const src = read(f);
      return banned.filter((cls) => src.includes(cls)).map((cls) => `${rel(f)}: ${cls}`);
    });
    expect(offenders).toEqual([]);
  });

  it('never builds a leading "+" itself — formatDeltaBps is the only source of the sign', () => {
    const offenders = SOURCE_FILES.filter((f) => /(['"`])\+/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
    const users = SOURCE_FILES.filter((f) => read(f).includes('formatDeltaBps'));
    expect(users.length).toBeGreaterThan(0);
  });
});
