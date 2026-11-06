import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/seed.js';
import { readFileSync } from 'node:fs';
const LEGACY=JSON.parse(readFileSync(new URL('./fixtures/legacy-plan.json',import.meta.url),'utf8'));
import { updatePlan } from '../src/plan-updates.js';
import { metrics, valid } from '../src/model.js';
import { genEdProgress, honorsProjection, groupProgress, COURSE_GROUPS, matchesCourse } from '../src/planning.js';

test('template requires four GenEd courses without a separate grading mode', () => {
  const p=structuredClone(SEED), g=genEdProgress(p);
  assert.equal(g.minimum,4);assert.equal(g.total,4);assert.equal(g.passed,0);
  assert.ok(p.courses.every(c=>!Object.hasOwn(c,'gradingMode')));
  assert.ok(p.courses.filter(c=>c.isGenEd).every(c=>c.category==='gen'));
  assert.ok(valid(p));
});
test('only selected S/U grades are excluded from GPA and pending credits', () => {
  const p=structuredClone(SEED);
  p.courses=[{credits:3,grade:'A',category:'core'},{credits:3,grade:'S',gradingMode:'su',category:'gen',isGenEd:true},{credits:3,grade:'U',gradingMode:'su',category:'gen',isGenEd:true},{credits:3,grade:'',gradingMode:'su',category:'gen',isGenEd:true},{credits:3,grade:'I',gradingMode:'su',category:'gen',isGenEd:true},{credits:2,grade:'',category:'core'}];
  const m=metrics(p.courses);assert.equal(m.gpa,4);assert.equal(m.gpaCredits,3);assert.equal(m.earned,6);
  assert.equal(honorsProjection(p).plannedRemaining,8);
  assert.equal(genEdProgress(p).passed,1);assert.equal(genEdProgress(p).missing,3);
});
test('four-course requirement is independent of credits and incomplete GenEd blocks required completion', () => {
  const p=structuredClone(SEED);p.categories=p.categories.map(c=>({...c,min:0}));
  p.courses=Array.from({length:3},()=>({category:'gen',isGenEd:true,gradingMode:'su',grade:'S',credits:6}));
  assert.equal(genEdProgress(p).passed,3);
  assert.equal(groupProgress(p,COURSE_GROUPS[0]).complete,false);
  p.courses.push({category:'gen',isGenEd:true,gradingMode:'letter',grade:'B',credits:1});
  assert.equal(groupProgress(p,COURSE_GROUPS[0]).complete,true);
});
test('legacy metadata migration preserves explicit choices and numeric grades', () => {
  const old=structuredClone(LEGACY);delete old.genEdMinCourses;
  for(const c of old.courses){delete c.isGenEd;delete c.gradingMode;}
  const lab=old.courses.find(c=>c.name==='SE LAB');lab.grade='A';lab.credits=1;
  const p=updatePlan(old);assert.equal(genEdProgress(p).total,4);assert.equal(p.genEdMinCourses,4);
  assert.equal(p.courses.find(c=>c.id===lab.id).gradingMode,undefined);
  assert.equal(p.courses.find(c=>c.id===lab.id).grade,'A');assert.ok(valid(p));
  p.courses.find(c=>c.name==='MGT PUB DISASTER').gradingMode='letter';
  assert.equal(updatePlan(p).courses.find(c=>c.name==='MGT PUB DISASTER').gradingMode,undefined);
  const clean=updatePlan(p);assert.deepEqual(updatePlan(clean),clean);
});

test('changing an old SU course to a numeric grade uses the selected grade immediately',()=>{
 const p=structuredClone(SEED);const course=p.courses.find(c=>c.id==='c48');
 course.credits=3;course.grade='S';course.gradingMode='su';
 assert.equal(metrics(p.courses).gpaCredits,0);assert.equal(metrics(p.courses).earned,3);
 course.grade='B';assert.ok(valid(p));
 const migrated=updatePlan(p);assert.equal(metrics(migrated.courses).gpa,3);assert.equal(metrics(migrated.courses).gpaCredits,3);
 assert.equal(migrated.courses.find(c=>c.id===course.id).grade,'B');
});
