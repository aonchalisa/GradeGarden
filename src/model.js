export const POINTS = { A: 4, 'B+': 3.5, B: 3, 'C+': 2.5, C: 2, 'D+': 1.5, D: 1, F: 0 };
export const GRADES = ['', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'S', 'U', 'W', 'I'];
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const unique = list => new Set(list.map(x => x.id)).size === list.length;
const number = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;

export function valid(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.courses) || !Array.isArray(plan.terms) || !Array.isArray(plan.categories)) return false;
  if (plan.courses.length > 1000 || !plan.terms.length || plan.terms.length > 100 || !plan.categories.length || plan.categories.length > 50 || !number(plan.target, 1000)) return false;
  if (!plan.categories.every(c => c && text(c.id, 64) && /^[a-z][a-z0-9_-]*$/.test(c.id) && c.id !== 'target' && text(c.name, 120) && number(c.min, 1000) && /^#[0-9a-f]{6}$/i.test(c.color))) return false;
  if (!plan.categories.some(c => c.id === 'core') || !plan.categories.some(c => c.id === 'unassigned')) return false;
  if (!plan.terms.every(t => t && text(t.id, 64) && text(t.name, 50) && Number.isInteger(t.year) && t.year >= 1 && t.year <= 12)) return false;
  if (!plan.courses.every(c => c && text(c.id, 64) && text(c.name, 120) && number(c.credits, 30) && GRADES.includes(c.grade) && (c.code === undefined || typeof c.code === 'string' && c.code.length <= 30) && (c.note === undefined || typeof c.note === 'string' && c.note.length <= 250) && plan.categories.some(x => x.id === c.category) && plan.terms.some(x => x.id === c.term))) return false;
  return unique(plan.courses) && unique(plan.terms) && unique(plan.categories) && new TextEncoder().encode(JSON.stringify(plan)).length <= 900000;
}

export function passed(course) {
  return course.grade === 'S' || (Object.hasOwn(POINTS, course.grade) && POINTS[course.grade] > 0);
}

export function metrics(courses) {
  let credits = 0, earned = 0, points = 0, gpaCredits = 0;
  for (const course of courses) {
    credits += course.credits;
    if (passed(course)) earned += course.credits;
    if (Object.hasOwn(POINTS, course.grade)) {
      points += POINTS[course.grade] * course.credits;
      gpaCredits += course.credits;
    }
  }
  return { credits, earned, points, gpaCredits, gpa: gpaCredits ? points / gpaCredits : null };
}
