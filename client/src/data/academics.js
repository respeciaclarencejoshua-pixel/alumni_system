export const ACADEMIC_PROGRAMS = {
  'College of Engineering, Architecture, and Technology (CEAT)': [
    'Bachelor of Science in Architecture', 'BS Civil Engineering', 'BS Computer Engineering',
    'BS Electrical Engineering', 'BS Electronics Engineering', 'BS Industrial Engineering',
    'BS Mechanical Engineering', 'BS Computer Science', 'BS Information Technology',
    'BS Entertainment and Multimedia Computing', 'BS Environmental Planning',
  ],
  'College of Education': [
    'Bachelor of Elementary Education', 'Bachelor of Secondary Education – English',
    'Bachelor of Secondary Education – Filipino', 'Bachelor of Secondary Education – Mathematics',
    'Bachelor of Secondary Education – Science', 'Bachelor of Secondary Education – Social Studies',
    'Bachelor of Secondary Education – Values Education', 'Bachelor of Physical Education',
    'Bachelor of Special Needs Education',
  ],
  'Business College': [
    'BS Accountancy', 'BS Accounting Information System', 'BS Internal Auditing',
    'BS Management Accounting', 'BS Business Administration – Financial Management',
    'BS Business Administration – Human Resource Management',
    'BS Business Administration – Marketing Management', 'BS Hospitality Management',
    'BS Tourism Management', 'Culinary Arts Technology',
  ],
  'College of Arts and Sciences': [
    'Bachelor of Arts in Communication', 'Bachelor of Arts in English Language',
    'Bachelor of Arts in Political Science', 'BS Biology', 'BS Psychology',
    'Bachelor of Multimedia Arts',
  ],
  'College of Health Sciences': [
    'BS Nursing', 'BS Medical Technology/Medical Laboratory Science', 'BS Pharmacy',
  ],
};

export const DEPARTMENTS = Object.keys(ACADEMIC_PROGRAMS);
export const GRADUATION_YEARS = Array.from(
  { length: new Date().getFullYear() - 1953 + 1 },
  (_, index) => new Date().getFullYear() - index
);

export function degreeForCourse(course) {
  if (course.startsWith('BS ') || course.startsWith('Bachelor of Science')) return 'Bachelor of Science';
  if (course.startsWith('Bachelor of Arts')) return 'Bachelor of Arts';
  if (course.includes('Education')) return 'Bachelor of Education';
  if (course.includes('Architecture')) return 'Bachelor of Science in Architecture';
  if (course.includes('Multimedia Arts')) return 'Bachelor of Multimedia Arts';
  if (course.includes('Culinary')) return 'Culinary Arts Technology';
  return 'Bachelor’s Degree';
}
