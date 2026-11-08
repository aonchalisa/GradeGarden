import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendedHonorsPlans } from '../src/planning.js';
import { SEED } from '../src/seed.js';
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
