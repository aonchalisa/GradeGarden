import { test } from 'node:test';
import assert from 'node:assert/strict';
import { honorsPlanAdvisor, creditsToTarget } from '../src/planning.js';
import { SEED } from '../src/seed.js';
import { valid } from '../src/model.js';
const plan = courses => ({ ...structuredClone(SEED), courses });
const baseline = () => plan([
 {credits:24,grade:'A'},{credits:24,grade:'A'},
 {credits:24,grade:'B'},{credits:24,grade:'B'},{credits:24,grade:'B'},
]);

test('extra credits can raise the final GPAX above the 138-credit minimum without any cap',()=>{
 const p=baseline(),a=honorsPlanAdvisor(p);
 assert.equal(a.endGpax,3.4);assert.equal(a.goals[0].needed,60);assert.equal(a.goals[0].coursesOfThreeCredits,20);
 assert.ok(a.goals[0].gpaxAtNeeded>=3.6);assert.equal(a.goals[1].needed,0);
 assert.equal(a.totalPlanCredits+a.goals[0].needed,180);
 p.target=100;assert.equal(honorsPlanAdvisor(p).goals[0].needed,60);
 p.target=300;assert.equal(honorsPlanAdvisor(p).goals[0].needed,60);
});
test('simulating extra courses uses weighted points and reduces the credits still needed',()=>{
 const p=baseline();p.honors={target:3.6,extraCredits:6,additionalGpa:4};
 const a=honorsPlanAdvisor(p);assert.equal(a.goals[0].needed,54);
 assert.equal(a.simulatedGpax,432/126);assert.equal(a.goals[0].coursesOfThreeCredits,18);
});
test('averages at or below the target cannot lift a below-target GPA to it',()=>{
 assert.equal(creditsToTarget(408,120,3.6,3.5),null);
 assert.equal(creditsToTarget(408,120,3.6,3.6),null);
 assert.equal(creditsToTarget(432,120,3.6,3),0);
 const p=baseline();p.honors={target:3.6,additionalGpa:3.5};
 assert.equal(honorsPlanAdvisor(p).goals[0].needed,null);
 assert.equal(honorsPlanAdvisor(p).goals[1].needed,0);
});
test('pending course assumptions forecast final semester GPAX without modifying saved courses',()=>{
 const p=plan([{credits:3,grade:'B'},{credits:3,grade:''},{credits:2,grade:'I'},
 {credits:3,grade:'S'},{credits:3,grade:'U'},{credits:3,grade:'W'},
 {credits:3,grade:'A',hidden:true},{credits:4,grade:'',hidden:true}]);
 p.honors={target:3.65,remainingCredits:900,pendingGpa:3.5,additionalGpa:4,extraCredits:0};
 const before=structuredClone(p),a=honorsPlanAdvisor(p);
 assert.equal(a.plannedRemaining,5);assert.equal(a.endCredits,8);assert.equal(a.endGpax,(9+17.5)/8);
 assert.equal(a.endTermName,'ปี 4 / เทอม 2');assert.deepEqual(p,before);
});
test('adding lower grades can drop a previously reached target; zero numeric credits are handled',()=>{
 const p=plan([{credits:30,grade:'A'}]);p.honors={target:3.25,extraCredits:200,additionalGpa:3};
 const a=honorsPlanAdvisor(p);assert.ok(a.endGpax>=3.25);assert.ok(a.simulatedGpax<3.25);assert.equal(a.goals[1].needed,null);
 const empty=honorsPlanAdvisor(plan([{credits:3,grade:'S'}]));assert.equal(empty.endGpax,null);assert.equal(empty.goals[0].needed,null);
});
test('scenario preferences are optional and compatible with old accounts',()=>{
 const p=structuredClone(SEED);p.honors={target:3.6,pendingGpa:3.5,additionalGpa:4,extraCredits:200};assert.ok(valid(p));
 p.honors.pendingGpa=5;assert.equal(valid(p),false);
 p.honors.pendingGpa=3.5;p.honors.extraCredits=-1;assert.equal(valid(p),false);
});
