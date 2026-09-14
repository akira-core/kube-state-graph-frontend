import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// dev-environment spec, "Typed fixture is the single source of demo data": "The repository
// MUST NOT contain any script, test, or development flow that requires a connection to a
// running kube-state-graph server, Prometheus-compatible store, or Kubernetes cluster to
// work." This is a structural invariant over the repo layout rather than app behaviour, so
// it is asserted here as a static scan rather than through a runtime test.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bkubectl\b/,
  /\bhelm\s+(install|upgrade|template)\b/,
  /\.svc\.cluster\.local\b/,
  // A live, non-local HTTP(S) target. localhost / 127.0.0.1 (the dev server and
  // Playwright's baseURL) are the only network endpoints this repo may name.
  /https?:\/\/(?!(?:localhost|127\.0\.0\.1))[a-z0-9.-]+\.[a-z]{2,}/i,
];

function filesUnder(relativeDir: string): string[] {
  const abs = path.join(REPO_ROOT, relativeDir);
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  };
  walk(abs);
  return out;
}

describe('no backend dependency anywhere in the repository', () => {
  it('no file under dev/, tests/, or .github/workflows/ names a live, non-local backend endpoint', () => {
    const files = [...filesUnder('dev'), ...filesUnder('tests'), ...filesUnder('.github/workflows')];
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) {
          offenders.push(`${path.relative(REPO_ROOT, file)}: matched ${pattern.source}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no package.json script requires a reachable backend', () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const offenders = Object.entries(pkg.scripts).filter(([, cmd]) => FORBIDDEN_PATTERNS.some((p) => p.test(cmd)));
    expect(offenders).toEqual([]);
  });
});
