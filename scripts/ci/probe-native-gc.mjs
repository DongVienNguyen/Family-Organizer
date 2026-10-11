import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Allocation-driven GC is deliberate: explicit global.gc() does not reproduce
// the Node24 ObjectWrap cleanup regression reported in nodejs/node#65446.
const db = new Database(':memory:');
let churn = [];
try {
  for (let index = 0; index < 300_000; index++) {
    assert.equal(db.prepare('SELECT ? AS id').get(index).id, index);
    churn.push({ index, payload: 'x'.repeat(256) });
    if (churn.length > 1000) churn = [];
  }
  console.log('allocation-driven native statement cleanup passed');
} finally { db.close(); }
