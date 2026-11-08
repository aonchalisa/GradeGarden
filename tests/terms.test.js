import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reorderTerms, termSummaries, termsByYear, orderedTerms, termKind, insertTerm, removeTerm, moveTermWithinYear } from '../src/terms.js';
import { SEED } from '../src/seed.js';
import { metrics, valid } from '../src/model.js';
import { updatePlan } from '../src/plan-updates.js';

test('reordering changes only term order, preserving courses and arbitrary term metadata',()=>{
 const p=structuredClone(SEED);p.terms[0].note='term note';p.courses[0].grade='A';p.courses[0].note='my course note';p.courses[1].hidden=true;
 const before=structuredClone(p),ids=p.terms.map(t=>t.id).reverse();
 const result=reorderTerms(p,ids);assert.deepEqual(result.terms.map(t=>t.id),ids);assert.deepEqual(result.courses,before.courses);
 assert.deepEqual(result.terms.find(t=>t.id==='t0'),before.terms[0]);assert.deepEqual(p,before);assert.deepEqual(metrics(result.courses),metrics(p.courses));
 for(const bad of [ids.slice(1),[ids[0],...ids.slice(1,-1),ids[0]],[...ids.slice(1),'unknown']])assert.throws(()=>reorderTerms(p,bad));
});
test('summer inserted between semesters updates intermediate GPAX but preserves final GPAX',()=>{
 const p={terms:[{id:'a',name:'ปี 1 / เทอม 1',year:1},{id:'b',name:'ปี 1 / เทอม 2',year:1},{id:'summer-custom',name:'ปี 1 / ฤดูร้อน',year:1}],courses:[{term:'a',credits:3,grade:'A'},{term:'b',credits:3,grade:'C'},{term:'summer-custom',credits:3,grade:'B'}]};
 const old=termSummaries(p);assert.equal(old[1].cumulative.gpa,3);
 const reordered=reorderTerms(p,['a','summer-custom','b']);const after=termSummaries(reordered);
 assert.equal(after[1].cumulative.gpa,3.5);assert.equal(after[2].cumulative.gpa,old[2].cumulative.gpa);
});

test('grouped year view keeps an appended summer with its year without modifying saved records',()=>{
 const p=structuredClone(SEED),summer={id:'late-summer',name:'ปี 1 / ฤดูร้อน',year:1};p.terms.push(summer);
 p.courses=[{term:'t0',credits:3,grade:'A'},{term:'t2',credits:3,grade:'C'},{term:summer.id,credits:3,grade:'B'}];
 const before=structuredClone(p),groups=termsByYear(p.terms);
 assert.deepEqual(groups.map(g=>g.year),[1,2,3,4]);assert.deepEqual(groups[0].terms.map(t=>t.id),['t0','t1',summer.id]);
 const summary=termSummaries(p);assert.equal(summary[2].term.id,summer.id);assert.equal(summary[2].cumulative.gpa,3.5);assert.equal(summary[3].cumulative.gpa,3);
 assert.deepEqual(p,before);assert.equal(termKind(summer),'summer');assert.equal(termKind({name:'Custom',kind:'summer'}),'summer');assert.equal(termKind(p.terms[0]),'regular');assert.equal(termKind({name:'summer',kind:'regular'}),'regular');
});

test('regular and summer insertion preserve all courses and position new years chronologically',()=>{
 const p=structuredClone(SEED),before=structuredClone(p),summer={id:'summer',name:'Summer',year:1,kind:'summer'};
 const added=insertTerm(p,summer,'t1');assert.equal(added.terms[2],summer);assert.deepEqual(added.courses,before.courses);assert.deepEqual(p,before);assert.ok(valid(added));
 const regular={id:'extra-regular',name:'Extra term',year:1,kind:'regular'},more=insertTerm(added,regular,'t1');
 assert.deepEqual(more.terms.slice(0,4).map(t=>t.id),['t0','t1',regular.id,summer.id]);
 assert.equal(insertTerm(p,{id:'year-five',name:'year 5',year:5}).terms.at(-1).id,'year-five');
 assert.throws(()=>insertTerm(p,summer,'t2'));assert.throws(()=>insertTerm(p,{...summer,id:'t0'},'t1'));
});

test('term deletion relocates every course with grades, notes and hidden state intact',()=>{
 const p=structuredClone(SEED);p.courses[0].grade='A';p.courses[0].hidden=true;p.courses[0].note='keep this';const before=structuredClone(p),id=p.courses[0].term;
 assert.throws(()=>removeTerm(p,id));assert.throws(()=>removeTerm(p,id,id));assert.throws(()=>removeTerm(p,id,'missing'));
 const removed=removeTerm(p,id,'t8');assert.ok(valid(removed));assert.equal(removed.terms.some(t=>t.id===id),false);
 assert.deepEqual(removed.courses,before.courses.map(c=>c.term===id?{...c,term:'t8'}:c));assert.deepEqual(metrics(removed.courses),metrics(before.courses));assert.deepEqual(p,before);
 const empty=insertTerm(p,{id:'empty',name:'empty',year:4},'t8');assert.deepEqual(removeTerm(empty,'empty'),p);
 assert.throws(()=>removeTerm({...p,terms:[p.terms[0]]},p.terms[0].id));
});

test('pointer, keyboard and position controls share bounded moves within the same year',()=>{
 const terms=orderedTerms(SEED.terms),ids=terms.map(t=>t.id);
 assert.deepEqual(moveTermWithinYear(terms,ids,'t1',0),['t1','t0',...ids.slice(2)]);
 for(const position of [-1,2,999,0.5])assert.deepEqual(moveTermWithinYear(terms,ids,'t1',position),ids);
 assert.deepEqual(ids,terms.map(t=>t.id));
});
test('custom year-three summers are retained by legacy normalization',()=>{
 const p=structuredClone(SEED);p.terms.push({id:'new-summer-uuid',name:'ปี 3 / ฤดูร้อน',year:3});
 const ids=p.terms.map(t=>t.id);ids.splice(5,0,ids.pop());
 assert.deepEqual(updatePlan(reorderTerms(p,ids)).terms.map(t=>t.id),ids);
});
