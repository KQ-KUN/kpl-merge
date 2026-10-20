import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { verifySnapshot } from '../scripts/verify-snapshot.mjs';

test('runtime manifest hashes final cues/icons/AAC tracks independently of readonly originals', async () => {
  const manifest = await verifySnapshot();
  assert.equal(manifest.outputs.length, 33); assert.equal(manifest.coverage.audioTracks, 20);
  assert.ok(manifest.resources.runtimeAudioBytes < manifest.resources.originalBytes * .65);
  const original = JSON.parse(await fs.readFile(new URL('../audio-originals/manifest.json', import.meta.url)));
  for (const asset of original.files) {
    const bytes = await fs.readFile(new URL(`../audio-originals/${asset.path}`, import.meta.url));
    assert.equal(bytes.length, asset.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  }
  const metrics = JSON.parse(await fs.readFile(new URL('../docs/audio-compression.json', import.meta.url)));
  for (const track of metrics.tracks) {
    assert.ok(track.durationDeltaSeconds < .1); assert.equal(track.runtime.media.streams.length, 1);
    assert.equal(track.runtime.media.streams[0].codec_name, 'aac'); assert.equal(track.runtime.media.streams[0].profile, 'LC');
  }
  assert.equal(metrics.humanListening, false);
});
