import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendedHonorsPlans, gpaxGoals } from '../src/planning.js';
import { SEED } from '../src/seed.js';
import { valid } from '../src/model.js';
const plan = rows => ({...structuredClone(SEED),courses:rows.map((r,i)=>({id:`r${i}`,name:`Course ${i}`,category:'core',term:'t8',...r}))});
const screenshotCase = ()=>plan([...Array.from({length:3},()=>({credits:13,grade:'A'})),...Array.from({length:7},()=>({credits:14,grade:'B'}))]);
function assertAllMeetGoal(goal){for(const p of goal.plans){assert.ok(p.projectedGpax+1e-10>=goal.target,p.id);assert.equal(p.extraCredits,p.extra.reduce((n,g)=>n+g.count*g.creditsEach,0));}}

test('automatic plans spell out courses, credits per course, target grades and exact forecast',()=>{
 const p=screenshotCase();p.honors={target:3.6,extraCredits:108,pendingGpa:4,additionalGpa:4};
 const before=structuredClone(p),r=recommendedHonorsPlans(p),g=r.goals[0];
 assert.equal(r.gradedCredits,137);assert.equal(r.currentGpax,450/137);assert.equal(g.actualReached,false);
 assert.equal(g.plans[0].extraCourses,36);assert.equal(g.plans[0].extraCredits,108);
 assert.deepEqual(g.plans[0].extra,[{grade:'A',count:36,creditsEach:3}]);
 assert.deepEqual(g.plans[1].extra,[{grade:'A',count:37,creditsEach:3},{grade:'B+',count:1,creditsEach:3}]);
 assert.deepEqual(g.plans[2].extra,[{grade:'A',count:48,creditsEach:3},{grade:'B+',count:48,creditsEach:3}]);
 assertAllMeetGoal(g);assert.equal(r.goals[1].actualReached,true);assert.equal(r.goals[1].plans.length,0);
 assert.deepEqual(p,before,'simulation must not modify grades or old sandbox preferences');
});
test('ungraded courses are planned before adding courses and are never called real achieved GPAX',()=>{
 const p=plan([{credits:3,grade:'B'},{credits:3,grade:''},{credits:3,grade:''},{credits:3,grade:''}]);
 const r=recommendedHonorsPlans(p),g=r.goals[0];
 assert.equal(r.currentGpax,3);assert.equal(g.actualReached,false);assert.equal(r.pendingCount,3);
 assert.equal(g.plans[0].extraCourses,0);assert.equal(g.plans[0].id,'within-plan');
 assert.equal(g.plans[0].assignments.filter(c=>c.targetGrade==='A').length,2);
 assertAllMeetGoal(g);assert.ok(p.courses.slice(1).every(c=>c.grade===''));
});
test('hidden and nonnumeric grades do not enter the baseline or pending recommendations',()=>{
 const p=plan([{credits:3,grade:'B'},{credits:3,grade:'A',hidden:true},{credits:3,grade:'',hidden:true},{credits:3,grade:'S'},{credits:3,grade:'U'},{credits:3,grade:'W'}]);
 const r=recommendedHonorsPlans(p);assert.equal(r.currentGpax,3);assert.equal(r.gradedCredits,3);assert.equal(r.pendingCredits,0);
 assertAllMeetGoal(r.goals[0]);assertAllMeetGoal(r.goals[1]);
});
test('recommendations support missing data, an empty numeric record, and existing plans',()=>{
 const empty=recommendedHonorsPlans(plan([{credits:3,grade:'S'}]));assert.equal(empty.currentGpax,null);assert.equal(empty.goals[0].plans.length,0);
 const newAccount=recommendedHonorsPlans(SEED);assert.equal(newAccount.currentGpax,null);assert.equal(newAccount.goals[0].actualReached,false);
 assert.equal(newAccount.goals[0].plans[0].extraCourses,0);assertAllMeetGoal(newAccount.goals[0]);
 const missing=recommendedHonorsPlans(plan([{credits:0,grade:'',verify:true}]));assert.equal(missing.needsReview,true);assert.equal(missing.goals[0].plans.length,0);
});
test('alternative plans are distinct and the result is independent of the minimum degree credits',()=>{
 const p=plan([{credits:3,grade:'C'},{credits:3,grade:'B'}]);const r=recommendedHonorsPlans(p);
 for(const goal of r.goals){assert.equal(new Set(goal.plans.map(p=>JSON.stringify([p.assignments,p.extra]))).size,goal.plans.length);assertAllMeetGoal(goal);}
 const q=screenshotCase(),a=recommendedHonorsPlans(q);q.target=300;assert.deepEqual(recommendedHonorsPlans(q).goals,a.goals);
});
test('custom GPAX targets use the requested minimum and preserve every saved grade',()=>{
 const p=screenshotCase();p.honors={target:3.4,mode:'custom',customTarget:3.4,extraCredits:108};
 const before=structuredClone(p),r=recommendedHonorsPlans(p),goal=r.goals[2];
 assert.equal(r.selectedId,'custom');assert.equal(goal.target,3.4);assert.equal(goal.actualReached,false);assert.equal(goal.plans[0].extraCourses,9);
 assertAllMeetGoal(goal);assert.deepEqual(p,before);
 p.honors.target=3;p.honors.customTarget=3;
 assert.equal(recommendedHonorsPlans(p).goals[2].actualReached,true);
 const exact=plan([{credits:3,grade:'B'}]);exact.honors={target:3};
 assert.equal(gpaxGoals(exact).selectedId,'custom');assert.equal(recommendedHonorsPlans(exact).goals[2].actualReached,true);
});

test('preset and custom selections stay distinct even when numeric targets match',()=>{
 const p=structuredClone(SEED);assert.equal(gpaxGoals(p).selectedId,'3.6');
 p.honors={target:3.25,mode:'custom'};assert.equal(gpaxGoals(p).customTarget,3.25);
 p.honors={target:3.25,mode:'custom',customTarget:3.25};assert.equal(gpaxGoals(p).selectedId,'custom');
 p.honors={...p.honors,target:3.6,mode:'honors'};assert.equal(gpaxGoals(p).selectedId,'3.6');assert.equal(gpaxGoals(p).customTarget,3.25);
 p.honors.target=3.65;assert.equal(gpaxGoals(p).selectedId,'3.6');
});

test('a 4.00 goal rejects impossible additions and supports all-A pending grades',()=>{
 const p=plan([{credits:3,grade:'B'},{credits:3,grade:''}]);p.honors={target:4,mode:'custom',customTarget:4};
 const g=recommendedHonorsPlans(p).goals[2];assert.equal(g.unreachable,true);assert.deepEqual(g.plans,[]);
 p.courses[0].grade='A';const attainable=recommendedHonorsPlans(p).goals[2];assert.equal(attainable.unreachable,undefined);assertAllMeetGoal(attainable);assert.equal(attainable.plans[0].extraCredits,0);
 for(const target of [0,2.75,3.25,3.5,3.75,3.99]){p.courses[0].grade='C';p.honors.target=target;p.honors.customTarget=target;assertAllMeetGoal(recommendedHonorsPlans(p).goals[2]);}
});

test('custom settings validate and survive JSON backups without losing legacy preferences',()=>{
 const p=structuredClone(SEED);p.honors={target:3.42,mode:'custom',customTarget:3.42,extraCredits:108};
 assert.ok(valid(p));assert.deepEqual(JSON.parse(JSON.stringify(p)).honors,p.honors);
 for(const value of [-1,4.01,NaN,Infinity,'3.4',null]){p.honors.target=value;assert.equal(valid(p),false);}
 p.honors.target=3.42;for(const value of [-1,5,'3.4']){p.honors.customTarget=value;assert.equal(valid(p),false);}
 p.honors.customTarget=3.42;p.honors.mode='unknown';assert.equal(valid(p),false);
 const old=structuredClone(SEED);old.honors={target:3,extraCredits:108};const before=structuredClone(old);assert.ok(valid(old));gpaxGoals(old);assert.deepEqual(old,before);
});
