#!/usr/bin/env node
/**
 * Serialize SHOWCASE_GRAPH to public/demo/graph.json.
 * Usage:
 *   npm run fixture:build
 *   npm run fixture:check   (fails if the committed file drifted)
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureUrl = pathToFileURL(path.join(root, 'src/shared/fixtures/showcaseGraph.ts')).href;
const outPath = path.join(root, 'public/demo/graph.json');
const check = process.argv.includes('--check');

const { SHOWCASE_GRAPH } = await import(fixtureUrl);

function serialize(graph) {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

const next = serialize(SHOWCASE_GRAPH);

async function readExisting() {
  try {
    return await readFile(outPath, 'utf8');
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

const existing = await readExisting();

if (check) {
  if (existing === null || existing !== next) {
    console.error('public/demo/graph.json is out of date. Run `npm run fixture:build` to regenerate it.');
    process.exit(1);
  }
  process.exit(0);
}

if (existing === next) {
  process.exit(0);
}

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, next);
const digest = createHash('sha256').update(next).digest('hex').slice(0, 12);
console.log(`wrote ${path.relative(root, outPath)} (${digest})`);
