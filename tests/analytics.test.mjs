import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoundAnalytics} from '../src/game/analytics.js';

test('favorite and real gameover are separate and each fires once per round',()=>{
  const events=[],tracker=createRoundAnalytics(event=>events.push(event));
  tracker.begin(); tracker.favorite(); tracker.favorite(); tracker.gameover(); tracker.gameover(); tracker.favorite();
  assert.deepEqual(events,['merge-start','merge-favorite','merge-gameover']);
  tracker.begin('restart'); tracker.favorite(); tracker.gameover();
  assert.deepEqual(events.slice(3),['merge-restart','merge-start','merge-favorite','merge-gameover']);
});
test('setup, canceled rounds, restoration and development scenes produce no business events',()=>{
  const events=[],tracker=createRoundAnalytics(event=>events.push(event));
  tracker.favorite(); tracker.gameover();
  for(const reason of ['restore','debug']) {tracker.begin(reason);tracker.favorite();tracker.gameover();}
  assert.deepEqual(events,[]);
  tracker.begin();tracker.cancel();tracker.favorite();tracker.gameover();
  assert.deepEqual(events,['merge-start']);
});
test('unavailable tracking never interrupts round transitions',()=>{
  const tracker=createRoundAnalytics(()=>{throw new Error('offline');});
  assert.doesNotThrow(()=>{tracker.begin();tracker.favorite();tracker.gameover();tracker.begin('restart');});
});
