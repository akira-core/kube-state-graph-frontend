#!/usr/bin/env node
/**
 * Serialize SHOWCASE_GRAPH and SHOWCASE_STORAGE_GRAPH to public/demo/*.json.
 * Usage:
 *   npm run fixture:build
 *   npm run fixture:check   (fails if a committed file drifted)
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const graphUrl = pathToFileURL(path.join(root, 'src/shared/fixtures/showcaseGraph.ts')).href;
const storageUrl = pathToFileURL(path.join(root, 'src/shared/fixtures/showcaseStorageGraph.ts')).href;
const check = process.argv.includes('--check');

const { SHOWCASE_GRAPH } = await import(graphUrl);
const { SHOWCASE_STORAGE_GRAPH } = await import(storageUrl);

function serialize(graph) {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

const targets = [
  { outPath: path.join(root, 'public/demo/graph.json'), next: serialize(SHOWCASE_GRAPH) },
  { outPath: path.join(root, 'public/demo/storage-graph.json'), next: serialize(SHOWCASE_STORAGE_GRAPH) },
];

async function readExisting(outPath) {
  try {
    return await readFile(outPath, 'utf8');
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

let drifted = false;
for (const { outPath, next } of targets) {
  const existing = await readExisting(outPath);
  const rel = path.relative(root, outPath);
  if (check) {
    if (existing === null || existing !== next) {
      console.error(`${rel} is out of date. Run \`npm run fixture:build\` to regenerate it.`);
      drifted = true;
    }
    continue;
  }
  if (existing === next) {
    continue;
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, next);
  const digest = createHash('sha256').update(next).digest('hex').slice(0, 12);
  console.log(`wrote ${rel} (${digest})`);
}

if (check && drifted) {
  process.exit(1);
}
