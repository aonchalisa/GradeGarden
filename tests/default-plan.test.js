import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEED } from '../src/seed.js';
import { valid, metrics } from '../src/model.js';
import { updatePlan } from '../src/plan-updates.js';
import { SyncEngine } from '../src/sync.js';
const LEGACY=JSON.parse(readFileSync(new URL('./fixtures/legacy-plan.json',import.meta.url),'utf8'));

test('new default follows each image term and totals 138 with four generic GenEd slots',()=>{
 assert.ok(valid(SEED));assert.equal(SEED.courses.length,52);assert.equal(metrics(SEED.courses).credits,138);
 assert.deepEqual(SEED.terms.map(t=>metrics(SEED.courses.filter(c=>c.term===t.id)).credits),[16,20,16,19,18,15,19,15]);
 assert.equal(SEED.courses.filter(c=>c.isGenEd).length,4);
 assert.ok(SEED.courses.every(c=>c.grade===''&&c.hidden===undefined));
 assert.ok(SEED.courses.every(c=>!['ENG MATERIAL','ENG DRAWING','INDIV COMP II','FUND ORAL BIO HLTH','MGT PUB DISASTER'].includes(c.name)));
 const expected={gen:30,science:21,foundation:11,core:40,approved:6,century:6,elective:18,free:6,unassigned:0};
 for(const [id,credits] of Object.entries(expected))assert.equal(metrics(SEED.courses.filter(c=>c.category===id)).credits,credits,id);
});
test('image colors determine the corrected categories and semester positions',()=>{
 for(const [id,category,term] of [['c12','foundation','t0'],['c13','gen','t0'],['c15','core','t1'],['c16','gen','t1'],['c19','science','t2'],['c21','foundation','t3'],['c28','foundation','t4'],['c43','foundation','t7'],['c34','core','t2'],['c41','core','t3']]){
  const c=SEED.courses.find(c=>c.id===id);assert.equal(c.category,category);assert.equal(c.term,term);
 }
 assert.equal(new Set(SEED.courses.filter(c=>c.category==='core').map(c=>c.accentColor)).size,4);
 assert.deepEqual(updatePlan(SEED),SEED,'new seed is already normalized');
});
test('a saved legacy account does not receive the new seed or trigger an automatic save',async()=>{
 const existing=structuredClone(LEGACY);existing.courses[0].grade='B+';existing.courses[0].note='user note';existing.courses[3].hidden=true;
 let saves=0,received;
 const engine=new SyncEngine({userId:'existing',fresh:()=>structuredClone(SEED),valid,transform:updatePlan,
  api:{load:async()=>({data:structuredClone(existing),revision:17}),save:async()=>{saves++;throw Error('must not overwrite');}},
  storage:{getItem:()=>null,removeItem:()=>{},setItem:()=>{}},onPlan:p=>{received=p;},onStatus:()=>{}});
 await engine.open();assert.deepEqual(received,existing);assert.equal(received.courses.length,55);assert.equal(saves,0);engine.dispose();
});
