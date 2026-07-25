const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const slug = value => text(value).toLocaleLowerCase('tk-TM').replace(/[^a-z0-9äçňöşüýž]+/gi, '-').replace(/^-+|-+$/g, '');
const boundedName = value => text(value, 80);
const boundedDescription = value => text(value, 300);

export function normalizeRegistrationGroupData(input = {}) {
  const school = text(input.school, 120);
  const schoolId = text(input.schoolId, 120);
  const className = text(input.className, 12).toLocaleUpperCase('tk-TM');
  const graduationYear = Number(input.graduationYear);
  const yearSource = Array.isArray(input.attendanceYears) ? input.attendanceYears.join(',') : input.attendanceYears;
  const attendanceYears = [...new Set(String(yearSource ?? '')
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100))]
    .sort((a, b) => a - b)
    .slice(0, 20);

  if (!school) throw new Error('Mekdebiň adyny ýazyň.');
  if (!className) throw new Error('Klasyňyzy ýazyň.');
  if (!Number.isInteger(graduationYear) || graduationYear < 1900 || graduationYear > 2100) throw new Error('Uçuryş ýyly nädogry.');
  if (!attendanceYears.length) throw new Error('Mekdebe baran iň bolmanda bir ýylyňyzy ýazyň.');

  return { school, schoolId, className, graduationYear, attendanceYears };
}

export function automaticGroupDefinitions(input = {}) {
  const data = normalizeRegistrationGroupData(input);
  const schoolKey = data.schoolId ? `id-${slug(data.schoolId)}` : `name-${slug(data.school)}`;
  return [
    {
      key: `school-${schoolKey}`,
      groupKey: `school-${schoolKey}`,
      kind: 'school',
      autoManaged: true,
      school: data.school,
      schoolId: data.schoolId,
      name: boundedName(`Mekdep · ${data.school}`),
      icon: '🏫',
      description: boundedDescription(`${data.school} mekdebine degişli agzalar.`)
    },
    {
      key: `class-${schoolKey}-${slug(data.className)}-${data.graduationYear}`,
      groupKey: `class-${schoolKey}-${slug(data.className)}-${data.graduationYear}`,
      kind: 'class',
      autoManaged: true,
      school: data.school,
      schoolId: data.schoolId,
      className: data.className,
      graduationYear: data.graduationYear,
      name: boundedName(`Klasdaşlar · ${data.school} · ${data.className} · ${data.graduationYear}`),
      icon: '👥',
      description: boundedDescription(`Şol bir mekdepde, ${data.className} klasda we ${data.graduationYear}-nji ýylda uçurym bolan agzalar.`)
    },
    ...data.attendanceYears.map(year => ({
      key: `year-${schoolKey}-${year}`,
      groupKey: `year-${schoolKey}-${year}`,
      kind: 'school-year',
      autoManaged: true,
      school: data.school,
      schoolId: data.schoolId,
      attendanceYear: year,
      name: boundedName(`Mekdep ýyly · ${data.school} · ${year}`),
      icon: '📅',
      description: boundedDescription(`${year}-nji ýylda ${data.school} mekdebinde okan agzalar.`)
    }))
  ];
}

export function registrationDataFromGroups(groups = []) {
  const automatic = groups.filter(group => group?.autoManaged === true);
  const classGroup = automatic.find(group => group.kind === 'class');
  const schoolGroup = automatic.find(group => group.kind === 'school');
  const yearGroups = automatic.filter(group => group.kind === 'school-year');
  if (!classGroup || !schoolGroup || !yearGroups.length) return null;
  try {
    return normalizeRegistrationGroupData({
      school: classGroup.school || schoolGroup.school,
      schoolId: classGroup.schoolId || schoolGroup.schoolId,
      className: classGroup.className,
      graduationYear: classGroup.graduationYear,
      attendanceYears: yearGroups.map(group => group.attendanceYear)
    });
  } catch {
    return null;
  }
}
