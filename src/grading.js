export function isSuCourse(course) {
  return course.gradingMode === 'su' || course.grade === 'S' || course.grade === 'U';
}
export function suProgress(courses) {
  const su = courses.filter(isSuCourse);
  return { total: su.length, passed: su.filter(c => c.grade === 'S').length,
    failed: su.filter(c => c.grade === 'U').length,
    pending: su.filter(c => !['S', 'U'].includes(c.grade)).length };
}
