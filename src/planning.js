import { metrics, passed, isCounted, POINTS } from './model.js';

export const COURSE_GROUPS = [
  { id: 'required', name: 'บังคับเรียน', categories: ['gen', 'science', 'foundation', 'core'], color: '#b8789b' },
  { id: 'required-choice', name: 'บังคับเลือก', categories: ['approved'], color: '#789c45' },
  { id: 'century', name: 'ศตวรรษที่ 21', categories: ['century'], color: '#5d82bd' },
  { id: 'elective', name: 'วิชาเลือก', categories: ['elective'], color: '#9a9d2e' },
  { id: 'free', name: 'เลือกเสรี', categories: ['free'], color: '#85828d' },
  { id: 'unassigned', name: 'ยังไม่จัดหมวด', categories: ['unassigned'], color: '#9a8e98' },
];
export const HONORS = [
  { target: 3.6, name: 'เกียรตินิยมอันดับ 1' },
  { target: 3.25, name: 'เกียรตินิยมอันดับ 2' },
];
export function courseGroup(category) {
  return COURSE_GROUPS.find(g => g.categories.includes(category)) || COURSE_GROUPS.at(-1);
}
export function matchesCourse(course, { query = '', group = 'all' } = {}) {
  return (group === 'all' || courseGroup(course.category).id === group)
    && `${course.name} ${course.code || ''}`.toLowerCase().includes(query.toLowerCase().trim());
}
export function groupProgress(plan, group) {
  const categories = plan.categories.filter(c => courseGroup(c.id).id === group.id);
  const totals = metrics(plan.courses.filter(c => courseGroup(c.category).id === group.id));
  const minimum = categories.reduce((sum, c) => sum + c.min, 0);
  const missing = categories.reduce((sum, c) => sum + Math.max(0, c.min - metrics(plan.courses.filter(x => x.category === c.id)).earned), 0);
  const genEdMissing = group.id === 'required' ? genEdProgress(plan).missing : 0;
  return { ...totals, minimum, missing, categories, genEdMissing, complete: missing === 0 && genEdMissing === 0 };
}
export function honorsProjection(plan) {
  const completed = metrics(plan.courses);
  // Only pending numeric grades count as future GPA credits, never S/U/W.
  const pending = plan.courses.filter(c => isCounted(c) && (c.grade === '' || c.grade === 'I'));
  const plannedRemaining = pending.reduce((sum, c) => sum + c.credits, 0);
  const remaining = plan.honors?.remainingCredits ?? plannedRemaining;
  const finalCredits = completed.gpaCredits + remaining;
  const maxGpax = finalCredits ? (completed.points + 4 * remaining) / finalCredits : null;
  return {
    currentGpax: completed.gpa, gradedCredits: completed.gpaCredits, plannedRemaining, remaining, maxGpax,
    needsReview: pending.some(c => c.verify || !c.credits),
    goals: HONORS.map(goal => {
      const rawRequired = remaining ? (goal.target * finalCredits - completed.points) / remaining : null;
      return { ...goal, required: rawRequired === null ? null : Math.max(0, rawRequired),
        reachable: maxGpax !== null && maxGpax + 1e-10 >= goal.target,
        currentReached: completed.gpa !== null && completed.gpa + 1e-10 >= goal.target };
    }),
  };
}
// Round required future GPA upward so the displayed target is sufficient.
export const requiredGpaText = value => (Math.ceil((value - 1e-10) * 100) / 100).toFixed(2);

export function genEdProgress(plan) {
  const courses = plan.courses.filter(c => isCounted(c) && c.category === 'gen' && c.isGenEd);
  const completed = courses.filter(passed).length;
  const minimum = plan.genEdMinCourses ?? 4;
  return { total: courses.length, passed: completed, minimum, missing: Math.max(0, minimum - completed), complete: completed >= minimum };
}

// Extra credits are unconstrained by the graduation minimum (e.g. 138).
export function creditsToTarget(points, credits, target, futureGpa) {
  const gap = target * credits - points;
  if (credits > 0 && gap <= 1e-10) return 0;
  if (futureGpa <= target) return null;
  if (!credits) return 1;
  return Math.max(0, Math.ceil(gap / (futureGpa - target) - 1e-10));
}

export function honorsPlanAdvisor(plan) {
  // The revised helper uses real pending courses, not an old manually entered
  // "remaining credits" value. Keep that saved preference intact for compatibility.
  const base = honorsProjection({ ...plan, honors: { ...plan.honors, remainingCredits: null } });
  const recorded = metrics(plan.courses);
  const pendingGpa = plan.honors?.pendingGpa ?? 4;
  const additionalGpa = plan.honors?.additionalGpa ?? 4;
  const extraCredits = plan.honors?.extraCredits ?? 0;
  const endCredits = recorded.gpaCredits + base.plannedRemaining;
  const endPoints = recorded.points + pendingGpa * base.plannedRemaining;
  const endGpax = endCredits ? endPoints / endCredits : null;
  const simulatedCredits = endCredits + extraCredits;
  const simulatedPoints = endPoints + additionalGpa * extraCredits;
  const simulatedGpax = simulatedCredits ? simulatedPoints / simulatedCredits : null;
  return {
    ...base, pendingGpa, additionalGpa, extraCredits, endCredits, endPoints, endGpax,
    endTermName: plan.terms.at(-1)?.name || 'ท้ายแผน',
    simulatedGpax, totalPlanCredits: recorded.credits,
    goals: HONORS.map(goal => {
      const needed = simulatedCredits ? creditsToTarget(simulatedPoints, simulatedCredits, goal.target, additionalGpa) : null;
      const creditsInThreeCreditCourses = needed === null ? null : Math.ceil(needed / 3) * 3;
      return { ...goal, needed, reached: simulatedGpax !== null && simulatedGpax + 1e-10 >= goal.target,
        coursesOfThreeCredits: needed === null ? null : Math.ceil(needed / 3),
        gpaxAtNeeded: needed === null ? null : (simulatedPoints + additionalGpa * needed) / (simulatedCredits + needed),
        gpaxAtThreeCreditCourses: creditsInThreeCreditCourses === null || !simulatedCredits && !creditsInThreeCreditCourses ? null : (simulatedPoints + additionalGpa * creditsInThreeCreditCourses) / (simulatedCredits + creditsInThreeCreditCourses) };
    }),
  };
}

function blocksToGoal(points, credits, target, blockPoints, blockCredits) {
  const gap = target * credits - points;
  if (gap <= 1e-10) return 0;
  const gain = blockPoints - target * blockCredits;
  return gain > 0 ? Math.max(0, Math.ceil(gap / gain - 1e-10)) : null;
}

// Recommendations are computed from saved grades only. Previous sandbox inputs
// (extraCredits, pendingGpa, etc.) never change the real GPAX or this baseline.
export function recommendedHonorsPlans(plan) {
  const active = plan.courses.filter(isCounted), recorded = metrics(active);
  const waiting = active.filter(c => c.grade === '' || c.grade === 'I');
  const pending = waiting.filter(c => c.credits > 0);
  const pendingCredits = pending.reduce((n, c) => n + c.credits, 0);
  const endCredits = recorded.gpaCredits + pendingCredits;
  const actualComplete = !waiting.length;
  const needsReview = active.some(c => (Object.hasOwn(POINTS, c.grade) || c.grade === '' || c.grade === 'I') && (!c.credits || c.verify));
  function proposal(id, title, assignments, extra) {
    const assignedPoints = assignments.reduce((n, c) => n + POINTS[c.targetGrade] * c.credits, 0);
    const extraCredits = extra.reduce((n, g) => n + g.count * g.creditsEach, 0);
    const extraPoints = extra.reduce((n, g) => n + POINTS[g.grade] * g.count * g.creditsEach, 0);
    const finalPoints = recorded.points + assignedPoints + extraPoints;
    const finalCredits = endCredits + extraCredits;
    return { id, title, assignments, extra: extra.filter(g => g.count > 0), extraCredits,
      extraCourses: extra.reduce((n, g) => n + g.count, 0), finalCredits,
      projectedGpax: finalCredits ? finalPoints / finalCredits : null,
      inPlanGrades: ['A','B+'].map(grade => ({ grade, count: assignments.filter(c => c.targetGrade === grade).length,
        credits: assignments.filter(c => c.targetGrade === grade).reduce((n,c) => n+c.credits,0) })).filter(g => g.count > 0) };
  }
  const allA = pending.map(c => ({ id: c.id, name: c.name, credits: c.credits, targetGrade: 'A' }));
  const allAPoints = recorded.points + 4 * pendingCredits;
  return { currentGpax: recorded.gpa, gradedCredits: recorded.gpaCredits, pendingCredits, pendingCount: pending.length,
    actualComplete, needsReview, endTermName: plan.terms.at(-1)?.name || 'ท้ายแผน',
    totalPlanCredits: recorded.credits,
    goals: HONORS.map(goal => {
      const actualReached = recorded.gpa !== null && recorded.gpa + 1e-10 >= goal.target;
      if (!endCredits || (actualReached && !waiting.length)) return { ...goal, actualReached, plans: [] };
      const nA = blocksToGoal(allAPoints, endCredits, goal.target, 12, 3);
      const minimum = proposal('all-a', nA ? 'เพิ่มวิชาน้อยที่สุด · A ทุกวิชา' : 'ตั้งเป้า A ในวิชาที่เหลือ', allA,
        [{ grade: 'A', count: nA || 0, creditsEach: 3 }]);
      const proposals = [];
      if (!nA && pending.length) {
        // Start with B+ and upgrade the largest-credit pending courses to A
        // until the target is met, without ever modifying saved course grades.
        const ordered = [...pending].sort((a,b) => b.credits-a.credits || String(a.id).localeCompare(String(b.id)));
        let points = recorded.points + 3.5 * pendingCredits;
        const upgrades = new Set();
        for (const c of ordered) {
          if (points + 1e-10 >= goal.target * endCredits) break;
          upgrades.add(c.id); points += .5 * c.credits;
        }
        if (upgrades.size < pending.length) proposals.push(proposal('within-plan', 'ใช้วิชาที่เหลือในแผนก่อน',
          pending.map(c => ({ id:c.id,name:c.name,credits:c.credits,targetGrade:upgrades.has(c.id)?'A':'B+' })), []));
      }
      proposals.push(minimum);
      if (nA > 0) {
        const withOneB = blocksToGoal(allAPoints+10.5, endCredits+3, goal.target, 12, 3);
        proposals.push(proposal('one-b-plus', 'เผื่อ B+ ได้ 1 วิชา', allA,
          [{grade:'A',count:withOneB,creditsEach:3},{grade:'B+',count:1,creditsEach:3}]));
        if (goal.target < 3.5) {
          const nB = blocksToGoal(allAPoints,endCredits,goal.target,10.5,3);
          proposals.push(proposal('all-b-plus','เพิ่มด้วย B+ ทุกวิชา',allA,[{grade:'B+',count:nB,creditsEach:3}]));
        } else {
          const pairs = blocksToGoal(allAPoints,endCredits,goal.target,22.5,6);
          if (pairs !== null) proposals.push(proposal('mixed','A และ B+ อย่างละครึ่ง',allA,
            [{grade:'A',count:pairs,creditsEach:3},{grade:'B+',count:pairs,creditsEach:3}]));
        }
      }
      const seen=new Set();
      const distinct=proposals.filter(p=>{const key=JSON.stringify([p.assignments.map(c=>[c.id,c.targetGrade]),p.extra]);if(seen.has(key))return false;seen.add(key);return true;});
      return { ...goal, actualReached, plans: distinct, minimumExtraCredits: minimum.extraCredits };
    }) };
}
