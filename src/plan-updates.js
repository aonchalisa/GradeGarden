// Retire the original year-three summer slot without changing user-edited courses.
// Applies to existing cloud plans, offline drafts and imported backups as well.
export function updatePlan(input) {
  const plan = structuredClone(input);
  plan.genEdMinCourses ??= 4;
  const genEdNames = new Set(['FUND ORAL BIO HLTH', 'MGT PUB DISASTER', 'GENED']);
  for (const course of plan.courses) {
    course.isGenEd ??= genEdNames.has(course.name.trim().toUpperCase());
    if (course.isGenEd && course.category === 'unassigned' && course.id === 'c20' && course.name.trim().toUpperCase() === 'FUND ORAL BIO HLTH') course.category = 'gen';
    // Grading comes only from the selected grade; retire the former mode flag.
    delete course.gradingMode;
  }
  const summer = plan.terms.find(t => t.id === 't6' && t.year === 3 && t.name === 'ปี 3 / ฤดูร้อน');
  if (!summer) return plan;
  let destination = plan.terms.find(t => t.year === 4 && /^ปี\s*4\s*\/\s*เทอม\s*1$/.test(t.name));
  if (!destination) {
    const ids = new Set(plan.terms.map(t => t.id));
    let id = 'year4-term1';
    while (ids.has(id)) id += '-new';
    destination = { id, name: 'ปี 4 / เทอม 1', year: 4 };
    plan.terms.splice(plan.terms.indexOf(summer), 0, destination);
  }
  for (const course of plan.courses) if (course.term === summer.id) course.term = destination.id;
  plan.terms = plan.terms.filter(t => t.id !== summer.id);
  return plan;
}
