import { metrics } from './model.js';

export function reorderTerms(plan, ids) {
  if (!Array.isArray(ids) || ids.length !== plan.terms.length || new Set(ids).size !== ids.length) throw new Error('invalid_term_order');
  const byId = new Map(plan.terms.map(term => [term.id, term]));
  if (ids.some(id => !byId.has(id))) throw new Error('invalid_term_order');
  // Preserve the complete term records and every course/grade/note unchanged.
  return { ...plan, terms: ids.map(id => byId.get(id)) };
}

export function termSummaries(plan) {
  const cumulative = [];
  return plan.terms.map(term => {
    const courses = plan.courses.filter(course => course.term === term.id);
    cumulative.push(...courses);
    return { term, courses, metrics: metrics(courses), cumulative: metrics(cumulative) };
  });
}
