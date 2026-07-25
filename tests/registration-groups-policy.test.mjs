import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRegistrationGroupData,
  automaticGroupDefinitions,
  registrationDataFromGroups
} from '../klas-registration-groups-policy.mjs';

const registration = {
  school: '  Öde Abdullaýew adyndaky mekdep ',
  schoolId: ' school-1 ',
  className: ' a ',
  graduationYear: '2000',
  attendanceYears: '1990, 1991; 1991 1992'
};

test('registration grouping data is normalized', () => {
  const data = normalizeRegistrationGroupData(registration);
  assert.equal(data.schoolId, 'school-1');
  assert.equal(data.className, 'A');
  assert.deepEqual(data.attendanceYears, [1990, 1991, 1992]);
});

test('registration creates deterministic school, class and attendance-year documents', () => {
  const first = automaticGroupDefinitions(registration);
  const second = automaticGroupDefinitions({ ...registration, attendanceYears: [1992, 1991, 1990] });
  assert.deepEqual(first.map(group => group.key), second.map(group => group.key));
  assert.equal(new Set(first.map(group => group.key)).size, first.length);
  assert.ok(first.every(group => group.key === group.groupKey && group.autoManaged === true));
  assert.ok(first.every(group => group.name.length <= 80 && group.description.length <= 300));
});

test('server group documents reconstruct the same registration classification', () => {
  const groups = automaticGroupDefinitions(registration);
  const reconstructed = registrationDataFromGroups(groups);
  assert.deepEqual(reconstructed, normalizeRegistrationGroupData(registration));
});

test('incomplete or manual groups cannot become a server classification', () => {
  assert.equal(registrationDataFromGroups([{ kind:'class', autoManaged:true }]), null);
  assert.equal(registrationDataFromGroups([{ kind:'school', autoManaged:false }]), null);
});

test('missing registration classification is rejected', () => {
  assert.throws(() => automaticGroupDefinitions({ school: '', className: 'A', graduationYear: 2000, attendanceYears: '1999' }), /Mekdebiň/);
  assert.throws(() => automaticGroupDefinitions({ school: 'M', className: '', graduationYear: 2000, attendanceYears: '1999' }), /Klasyňyzy/);
  assert.throws(() => automaticGroupDefinitions({ school: 'M', className: 'A', graduationYear: 2000, attendanceYears: '' }), /iň bolmanda bir/);
});
