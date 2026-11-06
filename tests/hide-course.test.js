import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/seed.js';
import { isCounted, metrics, valid } from '../src/model.js';
import { honorsProjection, genEdProgress, groupProgress, COURSE_GROUPS } from '../src/planning.js';
import { updatePlan } from '../src/plan-updates.js';

test('old plans remain included and get no hidden flags on load',()=>{
 const before=structuredClone(SEED),after=updatePlan(before);
 assert.deepEqual(after,before);assert.ok(after.courses.every(isCounted));
 assert.ok(after.courses.every(c=>!Object.hasOwn(c,'hidden')));
 assert.deepEqual(metrics(after.courses),metrics(before.courses));
});
test('hidden numeric, failed, SU and pending courses are excluded from every calculation',()=>{
 const p=structuredClone(SEED);p.courses=[
 {id:'keep',category:'core',credits:3,grade:'B'},
 {id:'a',category:'gen',isGenEd:true,credits:3,grade:'A',hidden:true},
 {id:'s',category:'gen',isGenEd:true,credits:3,grade:'S',hidden:true},
 {id:'f',category:'core',credits:3,grade:'F',hidden:true},
 {id:'pending',category:'core',credits:3,grade:'',hidden:true},
 {id:'i',category:'core',credits:3,grade:'I',hidden:true},
 {id:'future',category:'core',credits:2,grade:''}];
 assert.deepEqual(metrics(p.courses),{credits:5,earned:3,points:9,gpaCredits:3,gpa:3});
 assert.equal(honorsProjection(p).plannedRemaining,2);
 assert.equal(genEdProgress(p).total,0);assert.equal(genEdProgress(p).passed,0);
 assert.equal(groupProgress(p,COURSE_GROUPS[0]).earned,3);
});
test('hide/unhide restores all calculations without changing grades, credits or other account data',()=>{
 const p=structuredClone(SEED);p.courses[0].grade='A';p.courses[0].note='my existing note';
 p.honors={target:3.25,remainingCredits:12};
 const before=structuredClone(p),originalMetrics=metrics(p.courses);
 p.courses[0].hidden=true;
 const {hidden,...untouched}=p.courses[0];assert.deepEqual(untouched,before.courses[0]);
 assert.deepEqual(p.courses.slice(1),before.courses.slice(1));assert.deepEqual(p.honors,before.honors);
 assert.equal(metrics(p.courses).gpaCredits,0);assert.equal(honorsProjection(p).remaining,12);
 p.courses[0].hidden=false;assert.deepEqual(metrics(p.courses),originalMetrics);assert.ok(valid(p));
 p.courses[0].hidden='yes';assert.equal(valid(p),false);
});
