import { metrics } from './model.js';

export const COURSE_GROUPS = [
  { id: 'required', name: 'บังคับเรียน', categories: ['gen', 'science', 'foundation', 'core'], color: '#b8789b' },
  { id: 'required-choice', name: 'บังคับเลือก', categories: ['approved'], color: '#789c45' },
  { id: 'century', name: 'ศตวรรษที่ 21', categories: ['century'], color: '#5d82bd' },
  { id: 'elective', name: 'วิชาเลือก', categories: ['elective'], color: '#9a9d2e' },
  { id: 'free', name: 'เลือกเสรี', categories: ['free'], color: '#85828d' },
  { id: 'unassigned', name: 'ยังไม่จัดหมวด', categories: ['unassigned'], color: '#9a8e98' },
];
export const HONORS = [
  { target: 3.65, name: 'เกียรตินิยมอันดับ 1' },
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
  return { ...totals, minimum, missing, categories, complete: missing === 0 };
}
export function honorsProjection(plan) {
  const completed = metrics(plan.courses);
  // Only pending numeric grades count as future GPA credits, never S/U/W.
  const pending = plan.courses.filter(c => c.grade === '' || c.grade === 'I');
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
