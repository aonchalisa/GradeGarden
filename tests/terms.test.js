import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reorderTerms, termSummaries } from '../src/terms.js';
import { SEED } from '../src/seed.js';
import { metrics } from '../src/model.js';
import { updatePlan } from '../src/plan-updates.js';

test('reordering changes only term order, preserving courses and arbitrary term metadata',()=>{
 const p=structuredClone(SEED);p.terms[0].note='term note';p.courses[0].grade='A';p.courses[0].note='my course note';p.courses[1].hidden=true;
 const before=structuredClone(p),ids=p.terms.map(t=>t.id).reverse();
 const result=reorderTerms(p,ids);assert.deepEqual(result.terms.map(t=>t.id),ids);assert.deepEqual(result.courses,before.courses);
 assert.deepEqual(result.terms.find(t=>t.id==='t0'),before.terms[0]);assert.deepEqual(p,before);assert.deepEqual(metrics(result.courses),metrics(p.courses));
 for(const bad of [ids.slice(1),[ids[0],...ids.slice(1,-1),ids[0]],[...ids.slice(1),'unknown']])assert.throws(()=>reorderTerms(p,bad));
});
test('summer inserted between semesters updates intermediate GPAX but preserves final GPAX',()=>{
 const p={terms:[{id:'a',name:'ปี 1 / เทอม 1',year:1},{id:'b',name:'ปี 2 / เทอม 1',year:2},{id:'summer-custom',name:'ปี 1 / ฤดูร้อน',year:1}],courses:[{term:'a',credits:3,grade:'A'},{term:'b',credits:3,grade:'C'},{term:'summer-custom',credits:3,grade:'B'}]};
 const old=termSummaries(p);assert.equal(old[1].cumulative.gpa,3);
 const reordered=reorderTerms(p,['a','summer-custom','b']);const after=termSummaries(reordered);
 assert.equal(after[1].cumulative.gpa,3.5);assert.equal(after[2].cumulative.gpa,old[2].cumulative.gpa);
});
test('custom year-three summers are retained by legacy normalization',()=>{
 const p=structuredClone(SEED);p.terms.push({id:'new-summer-uuid',name:'ปี 3 / ฤดูร้อน',year:3});
 const ids=p.terms.map(t=>t.id);ids.splice(5,0,ids.pop());
 assert.deepEqual(updatePlan(reorderTerms(p,ids)).terms.map(t=>t.id),ids);
});
