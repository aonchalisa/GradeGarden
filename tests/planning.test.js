import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseGroup, COURSE_GROUPS, groupProgress, matchesCourse, honorsProjection, requiredGpaText } from '../src/planning.js';
import { SEED } from '../src/seed.js';
import { valid } from '../src/model.js';
const plan = courses => ({ ...structuredClone(SEED), courses });

test('honors uses weighted points and pending numeric credits, excluding S/U/W', () => {
  const p = plan([{ credits: 30, grade: 'A' }, { credits: 30, grade: 'B' }, { credits: 20, grade: '' }, { credits: 10, grade: 'I' }, { credits: 6, grade: 'S' }, { credits: 3, grade: 'W' }, { credits: 3, grade: 'U' }]);
  const r = honorsProjection(p);
  assert.equal(r.currentGpax, 3.5); assert.equal(r.remaining, 30); assert.equal(r.gradedCredits, 60);
  assert.ok(Math.abs(r.goals[0].required - 3.8) < 1e-10);
  assert.equal(requiredGpaText(r.goals[0].required), '3.80');
  assert.ok(Math.abs(r.goals[1].required - 2.75) < 1e-10);
  assert.equal(r.goals[0].reachable, true);
  p.honors = { target: 3.25, remainingCredits: 10 };
  assert.equal(honorsProjection(p).remaining, 10);
  assert.equal(honorsProjection(p).goals[0].reachable, false);
});
test('honors handles empty plans, no remaining credits, F and already-secured numeric targets', () => {
  assert.equal(honorsProjection(plan([])).maxGpax, null);
  assert.equal(honorsProjection(plan([{ credits: 3, grade: 'B' }])).goals[0].required, null);
  assert.equal(honorsProjection(plan([{ credits: 3, grade: 'A' }])).goals[0].currentReached, true);
  const fail = honorsProjection(plan([{ credits: 3, grade: 'F' }, { credits: 3, grade: '' }]));
  assert.equal(fail.maxGpax, 2); assert.equal(fail.goals[0].reachable, false);
  const secure = honorsProjection(plan([{ credits: 100, grade: 'A' }, { credits: 1, grade: '' }]));
  assert.equal(secure.goals[0].required, 0);
  assert.equal(requiredGpaText(3.65001), '3.66');
  assert.equal(requiredGpaText(3.65), '3.65');
  assert.equal(requiredGpaText(0), '0.00');
});
test('category filters reflect the requested broad groups and combine with search', () => {
  for (const id of ['gen','science','foundation','core']) assert.equal(courseGroup(id).id, 'required');
  assert.equal(courseGroup('approved').id, 'required-choice');
  assert.equal(courseGroup('free').name, 'เลือกเสรี');
  assert.equal(matchesCourse({ name: 'Calculus', code: '2301', category: 'science' }, { group: 'required', query: '2301' }), true);
  assert.equal(matchesCourse({ name: 'Calculus', category: 'science' }, { group: 'free' }), false);
  assert.equal(matchesCourse({ name: 'Calculus', category: 'science' }, { group: 'required', query: 'software' }), false);
});
test('excess in one required subgroup never compensates for another missing subgroup', () => {
  const p = structuredClone(SEED);
  p.categories = p.categories.map(c => ({ ...c, min: c.id === 'gen' || c.id === 'science' ? 3 : 0 }));
  p.courses = [{ category: 'gen', credits: 6, grade: 'A' }];
  const result = groupProgress(p, COURSE_GROUPS[0]);
  assert.equal(result.earned, result.minimum); assert.equal(result.missing, 3); assert.equal(result.complete, false);
});
test('new honors settings survive validation and old plans remain valid', () => {
  const p = structuredClone(SEED); assert.ok(valid(p));
  p.honors = { target: 3.65, remainingCredits: null }; assert.ok(valid(p));
  p.honors.remainingCredits = 12; assert.ok(valid(p));
  p.honors.remainingCredits = -1; assert.equal(valid(p), false);
  p.honors = { target: 5, remainingCredits: 12 }; assert.equal(valid(p), false);
});

test('first honors is 3.60 while legacy saved targets remain readable',()=>{
 const p=structuredClone(SEED);p.honors={target:3.65,remainingCredits:12};
 assert.ok(valid(p));assert.equal(honorsProjection(p).goals[0].target,3.6);
 p.honors.target=3.6;assert.ok(valid(p));assert.equal(honorsProjection(p).goals[1].target,3.25);
});
