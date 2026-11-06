import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine } from '../src/sync.js';
import { valid, metrics } from '../src/model.js';
import { SEED } from '../src/seed.js';
const fresh = () => structuredClone(SEED);
const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; };
function server() {
  const rows = new Map();
  return { rows, client(user) { return {
    async load() { return structuredClone(rows.get(user) || null); },
    async save(data, revision) { const prev = rows.get(user); if ((prev?.revision ?? null) !== revision) throw Object.assign(new Error('conflict'), { code: 'P0001' }); const row = { data: structuredClone(data), revision: (prev?.revision || 0) + 1 }; rows.set(user, row); return structuredClone(row); },
  }; } };
}
function make(api, opts = {}) {
  const statuses = [], plans = [];
  const engine = new SyncEngine({ api, userId: 'alice', fresh, valid, storage: storage(), onPlan: p => plans.push(structuredClone(p)), onStatus: s => statuses.push(s.kind), delay: 1e6, ...opts });
  return { engine, plans, statuses };
}
test('new accounts contain no private grades; GPA excludes non numeric grades', () => {
  assert.ok(valid(SEED)); assert.ok(SEED.courses.every(c => c.grade === ''));
  const m = metrics([{ credits: 3, grade: 'A' }, { credits: 1, grade: 'F' }, { credits: 2, grade: 'S' }, { credits: 3, grade: 'W' }, { credits: 3, grade: 'I' }, { credits: 3, grade: 'U' }, { credits: 3, grade: '' }]);
  assert.equal(m.gpa, 3); assert.equal(m.earned, 5);
});
test('a new device loads saved edits and two accounts remain separate', async () => {
  const db = server(), first = make(db.client('alice'));
  await first.engine.open(); const p = fresh(); p.courses[0].grade = 'A'; first.engine.change(p); await first.engine.flush();
  const second = make(db.client('alice')); await second.engine.open(); assert.equal(second.plans.at(-1).courses[0].grade, 'A');
  const bob = make(db.client('bob'), { userId: 'bob' }); await bob.engine.open(); assert.equal(bob.plans.at(-1).courses[0].grade, '');
  first.engine.dispose(); second.engine.dispose(); bob.engine.dispose();
});
test('offline edits survive reload and resume when connectivity returns', async () => {
  const db = server(), local = storage(), api = db.client('alice'); const first = make(api, { storage: local }); await first.engine.open();
  const original = api.save; api.save = async () => { throw new Error('offline'); };
  const p = fresh(); p.courses[0].grade = 'B+'; first.engine.change(p); assert.equal(await first.engine.flush(), false); assert.equal(first.statuses.at(-1), 'error'); first.engine.dispose();
  api.save = original; const restored = make(api, { storage: local }); await restored.engine.open(); assert.equal(db.rows.get('alice').data.courses[0].grade, 'B+'); assert.equal(local.getItem(restored.engine.key), null); restored.engine.dispose();
});
test('a stale tab keeps its draft and cannot overwrite a newer revision', async () => {
  const db = server(), a = make(db.client('alice')), b = make(db.client('alice')); await a.engine.open(); await b.engine.open();
  const p = fresh(); p.courses[0].grade = 'A'; a.engine.change(p); await a.engine.flush();
  const q = fresh(); q.courses[0].grade = 'D'; b.engine.change(q); assert.equal(await b.engine.flush(), false); assert.equal(b.statuses.at(-1), 'conflict'); assert.equal(db.rows.get('alice').data.courses[0].grade, 'A'); assert.ok(b.engine.pending);
  await b.engine.reload(); assert.equal(b.plans.at(-1).courses[0].grade, 'A'); assert.equal(b.engine.pending, null); a.engine.dispose(); b.engine.dispose();
});
test('edits arriving during an inflight save are sent after it, in order', async () => {
  const db = server(), api = db.client('alice'), { engine } = make(api); await engine.open();
  let release; const save = api.save; let count = 0;
  api.save = async (...args) => { if (++count === 1) await new Promise(r => { release = r; }); return save(...args); };
  let p = fresh(); p.courses[0].grade = 'B'; engine.change(p); const saving = engine.flush();
  p.courses[0].grade = 'A'; engine.change(p); release(); await saving;
  assert.equal(count, 2); assert.equal(db.rows.get('alice').data.courses[0].grade, 'A'); assert.equal(engine.pending, null); engine.dispose();
});
test('disposing a loading engine prevents old-account data from reaching UI', async () => {
  let release; const { engine, plans } = make({ load: () => new Promise(r => { release = r; }) }); const opening = engine.open(); engine.dispose(); release({ data: fresh(), revision: 1 }); await opening; assert.equal(plans.length, 0);
});
test('unavailable browser storage still allows cloud saving', async () => {
  const db = server(), { engine } = make(db.client('alice'), { storage: { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } } }); await engine.open(); assert.ok(db.rows.has('alice')); engine.dispose();
});
