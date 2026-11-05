import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null };
const { AUTO_SYNC_INTERVAL_MS, isPeriodicSyncDue } = await import('../js/cloud-sync.js');

test('periodic sync is due initially and exactly every 72 hours', () => {
  const now = Date.parse('2026-11-06T00:00:00Z');
  assert.equal(AUTO_SYNC_INTERVAL_MS, 259200000);
  assert.equal(isPeriodicSyncDue(null, now), true);
  assert.equal(isPeriodicSyncDue('invalid', now), true);
  assert.equal(isPeriodicSyncDue(new Date(now - AUTO_SYNC_INTERVAL_MS + 1).toISOString(), now), false);
  assert.equal(isPeriodicSyncDue(new Date(now - AUTO_SYNC_INTERVAL_MS).toISOString(), now), true);
});
