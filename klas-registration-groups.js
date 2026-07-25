import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { db, runtime, bridge, toast } from './klas-backend-core.js';
import {
  normalizeRegistrationGroupData,
  automaticGroupDefinitions,
  registrationDataFromGroups
} from './klas-registration-groups-policy.mjs';

let opening = false;
let synchronizing = null;

async function automaticMembershipGroups(uid){
  const snapshot = await getDocs(query(
    collection(db, 'groups'),
    where('memberIds', 'array-contains', uid),
    limit(100)
  ));
  return snapshot.docs
    .map(item => ({ id:item.id, ref:item.ref, ...item.data() }))
    .filter(group => group.autoManaged === true);
}

export async function assignRegistrationGroups(input){
  const user = runtime.user;
  if (!user || runtime.account?.onboardingComplete !== true) throw new Error('Akkaunt doly tamamlanmady.');
  if (synchronizing) return synchronizing;

  synchronizing = (async () => {
    const data = normalizeRegistrationGroupData(input);
    const definitions = automaticGroupDefinitions(data);
    const current = await automaticMembershipGroups(user.uid);
    const references = new Map();

    for (const definition of definitions) references.set(definition.key, doc(db, 'groups', definition.key));
    for (const group of current) references.set(group.id, group.ref);

    await runTransaction(db, async transaction => {
      const snapshots = new Map();
      for (const [key, reference] of references) snapshots.set(key, await transaction.get(reference));
      const desiredKeys = new Set(definitions.map(definition => definition.key));

      for (const definition of definitions) {
        const reference = references.get(definition.key);
        const snapshot = snapshots.get(definition.key);
        if (!snapshot.exists()) {
          transaction.set(reference, {
            ...definition,
            ownerId: user.uid,
            memberIds: [user.uid],
            membersCount: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          continue;
        }

        const group = snapshot.data();
        const members = [...new Set([...(group.memberIds || []), user.uid])];
        transaction.update(reference, {
          memberIds: members,
          membersCount: members.length,
          updatedAt: serverTimestamp()
        });
      }

      for (const group of current) {
        if (desiredKeys.has(group.id)) continue;
        const snapshot = snapshots.get(group.id);
        if (!snapshot?.exists()) continue;
        const members = (snapshot.data().memberIds || []).filter(uid => uid !== user.uid);
        transaction.update(group.ref, {
          memberIds: members,
          membersCount: members.length,
          updatedAt: serverTimestamp()
        });
      }
    });

    window.dispatchEvent(new CustomEvent('klas-registration-groups', {
      detail:{ uid:user.uid, groups:definitions, source:'firestore-transaction' }
    }));
    return definitions;
  })();

  try { return await synchronizing; }
  finally { synchronizing = null; }
}

function escaped(value){
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function openAssignmentDialog(forceEdit = false){
  if (opening || !runtime.user || runtime.account?.onboardingComplete !== true) return;
  opening = true;
  try {
    const existing = await automaticMembershipGroups(runtime.user.uid);
    const serverData = registrationDataFromGroups(existing);
    if (serverData && !forceEdit) {
      await assignRegistrationGroups(serverData);
      return;
    }

    const profile = runtime.profile || {};
    const seed = serverData || {
      school: profile.school || '',
      schoolId: profile.schoolId || '',
      className: profile.className || '',
      graduationYear: Number(profile.graduationYear) || 2000,
      attendanceYears: Array.isArray(profile.attendanceYears) ? profile.attendanceYears : []
    };

    bridge.openModal({
      title:serverData ? 'Topar maglumatlaryny täzele' : 'Toparlara awtomatik ýerleşdirmek',
      confirmText:serverData ? 'Täzele' : 'Toparlara goşul',
      cancelText:'Soňkyra',
      body:`<div class="backend-modal-status">Bu maglumatlar Firestore-da saklanýar we ähli enjamlarda şol bir deterministik toparlara sinhronlaşdyrylýar.</div><div class="form-grid"><div class="field"><label>Mekdep</label><input id="autoGroupSchool" maxlength="120" value="${escaped(seed.school)}" required></div><div class="form-grid two"><div class="field"><label>Mekdep ID-si</label><input id="autoGroupSchoolId" maxlength="120" value="${escaped(seed.schoolId)}" placeholder="mysal: ode-abdullayew-1"></div><div class="field"><label>Klas</label><input id="autoGroupClass" maxlength="12" value="${escaped(seed.className)}" placeholder="A" required></div></div><div class="form-grid two"><div class="field"><label>Uçuryş ýyly</label><input id="autoGroupGraduation" type="number" min="1900" max="2100" value="${Number(seed.graduationYear)||2000}" required></div><div class="field"><label>Mekdebe baran ýyllar</label><input id="autoGroupYears" value="${escaped((seed.attendanceYears || []).join(', '))}" placeholder="1990, 1991, 1992" required></div></div></div>`,
      onConfirm:async button=>{
        button.disabled=true;
        try{
          const groups=await assignRegistrationGroups({
            school:document.getElementById('autoGroupSchool').value,
            schoolId:document.getElementById('autoGroupSchoolId').value,
            className:document.getElementById('autoGroupClass').value,
            graduationYear:document.getElementById('autoGroupGraduation').value,
            attendanceYears:document.getElementById('autoGroupYears').value
          });
          bridge.closeModal();
          toast(`${groups.length} degişli topar Firestore-da sinhronlaşdyryldy`);
        }finally{button.disabled=false;opening=false;}
      }
    });
    setTimeout(()=>{ if(document.querySelector('.modal-overlay.open')===null) opening=false; },500);
  } catch (error) {
    opening = false;
    throw error;
  }
}

window.addEventListener('klas-account',()=>setTimeout(()=>openAssignmentDialog(false),450));
window.addEventListener('klas-auth',event=>{
  if(event.detail?.user&&!event.detail?.needsOnboarding)setTimeout(()=>openAssignmentDialog(false),700);
});
window.KlasRegistrationGroups=Object.freeze({
  assign:assignRegistrationGroups,
  open:()=>openAssignmentDialog(false),
  edit:()=>openAssignmentDialog(true),
  inspect:()=>automaticMembershipGroups(runtime.user?.uid)
});
if(runtime.user&&runtime.account?.onboardingComplete===true)setTimeout(()=>openAssignmentDialog(false),700);
