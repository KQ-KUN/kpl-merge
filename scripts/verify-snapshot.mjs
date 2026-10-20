import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export async function verifySnapshot(root = fileURLToPath(new URL('..', import.meta.url))) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/data/manifest.json')));
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)) throw Error('Invalid snapshot manifest');
  for (const output of manifest.outputs) {
    const target = path.resolve(root, output.path);
    if (!target.startsWith(path.resolve(root) + path.sep) || !/^(public\/|src\/data\/)/.test(output.path)) throw Error('Unsafe snapshot resource');
    const bytes = await fs.readFile(target);
    if (bytes.length !== output.bytes || createHash('sha256').update(bytes).digest('hex') !== output.sha256) throw Error(`Snapshot resource changed: ${output.path}`);
  }
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await verifySnapshot(); console.log(`Snapshot verified: ${manifest.outputs.length} final resources`);
}
