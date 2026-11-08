import { metrics } from './model.js';

// Keep saved order within a year; years themselves stay in academic order.
// This is a view, never a migration of an existing account.
export function termsByYear(terms) {
  const years = new Map();
  for (const term of terms) {
    if (!years.has(term.year)) years.set(term.year, []);
    years.get(term.year).push(term);
  }
  return [...years].sort(([a], [b]) => a - b).map(([year, terms]) => ({ year, terms }));
}

export const orderedTerms = terms => termsByYear(terms).flatMap(group => group.terms);
export const termKind = term => ['regular', 'summer'].includes(term.kind) ? term.kind : /ฤดูร้อน|ซัมเมอร์|summer/i.test(term.name) ? 'summer' : 'regular';

export function insertTerm(plan, term, afterId = '') {
  if (plan.terms.length >= 100 || plan.terms.some(t => t.id === term.id)) throw new Error('invalid_term');
  const terms = orderedTerms(plan.terms);
  const after = terms.find(t => t.id === afterId);
  if (afterId && (!after || after.year !== term.year)) throw new Error('invalid_term_position');
  const firstInYear = terms.findIndex(t => t.year >= term.year);
  const index = after ? terms.indexOf(after) + 1 : firstInYear < 0 ? terms.length : firstInYear;
  terms.splice(index, 0, term);
  return { ...plan, terms };
}

export function removeTerm(plan, id, destinationId) {
  if (plan.terms.length <= 1 || !plan.terms.some(t => t.id === id)) throw new Error('invalid_term');
  const courses = plan.courses.filter(c => c.term === id);
  if (courses.length && (destinationId === id || !plan.terms.some(t => t.id === destinationId))) throw new Error('term_has_courses');
  return { ...plan, terms: plan.terms.filter(t => t.id !== id),
    courses: courses.length ? plan.courses.map(c => c.term === id ? { ...c, term: destinationId } : c) : plan.courses };
}

export function moveTermWithinYear(terms, ids, id, position) {
  const index = ids.indexOf(id), byId = new Map(terms.map(t => [t.id, t]));
  if (index < 0 || !Number.isInteger(position) || position < 0 || position >= ids.length || byId.get(id)?.year !== byId.get(ids[position])?.year) return ids;
  const result = [...ids];
  result.splice(index, 1);
  result.splice(position, 0, id);
  return result;
}

export function reorderTerms(plan, ids) {
  if (!Array.isArray(ids) || ids.length !== plan.terms.length || new Set(ids).size !== ids.length) throw new Error('invalid_term_order');
  const byId = new Map(plan.terms.map(term => [term.id, term]));
  if (ids.some(id => !byId.has(id))) throw new Error('invalid_term_order');
  // Preserve the complete term records and every course/grade/note unchanged.
  return { ...plan, terms: ids.map(id => byId.get(id)) };
}

export function termSummaries(plan) {
  const cumulative = [];
  return orderedTerms(plan.terms).map(term => {
    const courses = plan.courses.filter(course => course.term === term.id);
    cumulative.push(...courses);
    return { term, courses, metrics: metrics(courses), cumulative: metrics(cumulative) };
  });
}
