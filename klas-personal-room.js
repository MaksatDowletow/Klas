import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import {
  db,
  runtime,
  bridge,
  safe,
  toast,
  uploadMedia,
  saveProfile,
  config,
  handleError
} from './klas-backend-core.js';

const DEFAULT_ROOM = Object.freeze({
  coverURL: '',
  className: 'A',
  interests: '',
  website: '',
  profileVisibility: 'members',
  mediaVisibility: 'members'
});

let room = { ...DEFAULT_ROOM };
let activeTab = 'overview';
let stopRoom = null;

function httpsUrl(value, allowEmpty = true) {
  const input = String(value || '').trim();
  if (!input && allowEmpty) return '';
  let parsed;
  try { parsed = new URL(input); }
  catch { throw new Error('URL salgysy nädogry.'); }
  if (parsed.protocol !== 'https:') throw new Error('Diňe HTTPS salgysy kabul edilýär.');
  return parsed.href;
}

function profile() {
  const current = bridge.getCurrentUser();
  if (runtime.profile) return { ...current, ...runtime.profile };
  return {
    uid: current.uid || current.id || 'me',
    fullName: current.name || 'Klas ulanyjysy',
    shortName: current.shortName || 'Ulanyjy',
    avatarURL: current.avatar || '',
    city: current.city || '',
    profession: current.role || '',
    bio: current.bio || '',
    school: current.school || 'Öde Abdullaýew adyndaky mekdep',
    graduationYear: current.graduationYear || 2000
  };
}

function ownerId() {
  const p = profile();
  return runtime.user?.uid || p.uid || 'me';
}

function own(item) {
  const id = ownerId();
  return item?.ownerId === id || item?.authorId === id || (!runtime.user && item?.ownerId === 'me');
}

function installStyles() {
  if (document.querySelector('link[data-klas-personal-room]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './klas-personal-room.css?v=20260726-room1';
  link.dataset.klasPersonalRoom = 'true';
  document.head.appendChild(link);
}

function installNavigation() {
  const nav = document.querySelector('#sidebar .nav');
  if (nav && !nav.querySelector('[data-page="room"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.page = 'room';
    button.innerHTML = '👤 <span>Meniň otagym</span>';
    button.onclick = () => window.showPage?.('room');
    nav.insertBefore(button, nav.children[1] || null);
  }
  const headerProfile = document.querySelector('.profile-btn');
  if (headerProfile) headerProfile.dataset.page = 'room';
}

function installPage() {
  if (document.getElementById('page-room')) return;
  const section = document.createElement('section');
  section.id = 'page-room';
  section.className = 'page personal-room-page';
  section.innerHTML = '<div class="card room-login"><div class="room-login-icon">👤</div><h1>Şahsy otag</h1><p>Maglumatlar taýýarlanýar…</p></div>';
  const feed = document.getElementById('page-feed');
  feed?.insertAdjacentElement('afterend', section);
}

function roomStats(state) {
  return {
    posts: state.posts.filter(own).length,
    media: state.media.filter(own).length,
    friends: state.people.filter(person => person.status === 'friend').length,
    albums: Number(window.KlasUserMedia?.albumCount?.() || 0)
  };
}

function roleLabel(p) {
  const parts = [p.profession, p.city].filter(Boolean);
  return parts.join(' · ') || 'Klas agzasy';
}

function coverStyle() {
  const url = httpsUrl(room.coverURL || '', true);
  return url ? ` style="background-image:url('${safe(url)}')"` : '';
}

function tabsMarkup() {
  const tabs = [
    ['overview', 'Baş sahypa'],
    ['posts', 'Ýazgylarym'],
    ['media', 'Mediýam'],
    ['about', 'Profil'],
    ['settings', 'Sazlamalar'],
    ['privacy', 'Gizlinlik']
  ];
  return `<nav class="card room-tabs" aria-label="Şahsy otag bölümleri">${tabs.map(([id, label]) => `<button type="button" data-room-tab="${id}" class="${activeTab === id ? 'active' : ''}" aria-pressed="${activeTab === id}">${label}</button>`).join('')}</nav>`;
}

function mediaPreview(items, limit = 6) {
  const list = items.slice(0, limit);
  if (!list.length) return '<div class="room-empty">Heniz şahsy media ýok.</div>';
  return `<div class="room-media-preview">${list.map(item => {
    const src = httpsUrl(item.src || '', true);
    if (!src) return '';
    const preview = item.type === 'video'
      ? `<video src="${safe(src)}" muted preload="metadata" playsinline></video>`
      : `<img src="${safe(src)}" alt="${safe(item.title || 'Media')}" loading="lazy">`;
    return `<button type="button" data-room-media="${safe(item.id)}" aria-label="${safe(item.title || 'Mediany aç')}">${preview}</button>`;
  }).join('')}</div>`;
}

function overviewMarkup(state, p) {
  const posts = state.posts.filter(own);
  const media = state.media.filter(own);
  const postPreview = posts.slice(0, 2).map(item => typeof window.postHTML === 'function'
    ? window.postHTML(item)
    : `<article class="card room-panel"><b>${safe(item.author || p.fullName)}</b><p>${safe(item.text || '')}</p></article>`).join('');
  return `<div class="room-grid">
    <div class="room-content">
      <article class="card room-panel"><h2>Men barada</h2><p>${safe(p.bio || 'Bio heniz doldurylmady.')}</p><div class="room-public-note">${safe(p.school || '')}${p.graduationYear ? ` · ${safe(p.graduationYear)}-nji ýyl` : ''}${room.className ? ` · ${safe(room.className)} klas` : ''}</div></article>
      <section class="room-content"><div class="page-head"><div><h2>Soňky ýazgylarym</h2><p>Şahsy diwaryňyzda paýlaşylan maglumatlar.</p></div><button type="button" class="secondary" data-room-tab-open="posts">Ählisini gör</button></div>${postPreview || '<div class="card room-empty">Heniz ýazgy ýok.</div>'}</section>
    </div>
    <aside class="room-content">
      <article class="card room-panel"><div class="page-head"><div><h3>Şahsy media</h3><p>Suratlar we wideolar.</p></div><button type="button" class="secondary" data-room-media-manager>Mediýany dolandyr</button></div>${mediaPreview(media)}</article>
      <article class="card room-panel"><h3>Çalt amallar</h3><div class="room-owner-actions"><button type="button" class="primary" data-room-edit-profile>Profili üýtget</button><button type="button" class="secondary" data-room-edit-cover>Gapagy sazla</button>${runtime.user && config?.ai?.profileAssistantEndpoint ? '<button type="button" class="secondary" data-room-ai>✨ AI bio</button>' : ''}</div></article>
    </aside>
  </div>`;
}

function postsMarkup(state) {
  const posts = state.posts.filter(own);
  if (!posts.length) return '<div class="card room-empty">Heniz şahsy ýazgy ýok.</div>';
  return `<div class="room-content" id="roomPosts">${posts.map(item => typeof window.postHTML === 'function' ? window.postHTML(item) : `<article class="card room-panel"><p>${safe(item.text || '')}</p></article>`).join('')}</div>`;
}

function mediaMarkup(state) {
  const items = state.media.filter(own);
  return `<article class="card room-panel"><div class="page-head"><div><h2>Meniň mediýam</h2><p>Şahsy suratlaryňyzy, wideolaryňyzy we albomlaryňyzy dolandyryň.</p></div><button type="button" class="primary" data-room-media-manager>Mediýany dolandyr</button></div>${mediaPreview(items, 60)}</article>`;
}

function aboutMarkup(p) {
  const rows = [
    ['Doly ady', p.fullName],
    ['Şäher', p.city || 'Görkezilmedi'],
    ['Hünär', p.profession || 'Görkezilmedi'],
    ['Mekdep', p.school || 'Görkezilmedi'],
    ['Uçuryş ýyly', p.graduationYear || 'Görkezilmedi'],
    ['Klas', room.className || 'Görkezilmedi'],
    ['Gyzyklanmalar', room.interests || 'Görkezilmedi'],
    ['Web sahypa', room.website || 'Görkezilmedi']
  ];
  return `<article class="card room-panel"><div class="page-head"><div><h2>Profil maglumatlary</h2><p>Şahsy otagyňyzda görünýän maglumatlar.</p></div><button type="button" class="primary" data-room-edit-profile>Üýtget</button></div><div class="room-about-list">${rows.map(([label, value]) => `<div class="room-about-row"><span>${safe(label)}</span><b>${safe(value)}</b></div>`).join('')}</div></article>`;
}

function settingsMarkup() {
  return `<div class="room-settings-grid">
    <article class="room-setting-card"><h3>Profil</h3><p>Adyňyzy, şäheriňizi, hünäriňizi, bio we avatar suratyňyzy sazlaň.</p><button type="button" class="primary" data-room-edit-profile>Profili sazla</button></article>
    <article class="room-setting-card"><h3>Gapak we şahsy maglumatlar</h3><p>Cover, klas, gyzyklanmalar we web salgysyny dolandyryň.</p><button type="button" class="secondary" data-room-edit-cover>Otagy sazla</button></article>
    <article class="room-setting-card"><h3>Şahsy media</h3><p>Albom dörediň, mediýany üýtgediň, geçiriň ýa-da pozuň.</p><button type="button" class="secondary" data-room-media-manager>Mediýany aç</button></article>
    <article class="room-setting-card"><h3>AI profil kömekçisi</h3><p>Bio üçin türkmençe, arassa we gysga tekst taýýarlaň. API açary diňe backend-de saklanýar.</p><button type="button" class="secondary" data-room-ai ${runtime.user && config?.ai?.profileAssistantEndpoint ? '' : 'disabled'}>✨ Bio taýýarla</button></article>
  </div>`;
}

function privacyMarkup() {
  const label = value => value === 'private' ? 'Diňe men' : value === 'friends' ? 'Diňe dostlar' : 'Klas agzalary';
  return `<article class="card room-panel"><div class="page-head"><div><h2>Gizlinlik sazlamalary</h2><p>Profil we media görünijiligini aýratyn dolandyryň.</p></div><button type="button" class="primary" data-room-privacy>Üýtget</button></div><div class="room-about-list"><div class="room-about-row"><span>Profil</span><b>${label(room.profileVisibility)}</b></div><div class="room-about-row"><span>Media</span><b>${label(room.mediaVisibility)}</b></div></div></article>`;
}

function contentMarkup(state, p) {
  if (activeTab === 'posts') return postsMarkup(state);
  if (activeTab === 'media') return mediaMarkup(state);
  if (activeTab === 'about') return aboutMarkup(p);
  if (activeTab === 'settings') return settingsMarkup();
  if (activeTab === 'privacy') return privacyMarkup();
  return overviewMarkup(state, p);
}

function bindRoomInteractions(root, state) {
  root.querySelectorAll('[data-room-tab]').forEach(button => button.onclick = () => {
    activeTab = button.dataset.roomTab;
    render();
  });
  root.querySelectorAll('[data-room-tab-open]').forEach(button => button.onclick = () => {
    activeTab = button.dataset.roomTabOpen;
    render();
  });
  root.querySelectorAll('[data-room-edit-profile]').forEach(button => button.onclick = openProfileEditor);
  root.querySelectorAll('[data-room-edit-cover]').forEach(button => button.onclick = openRoomEditor);
  root.querySelectorAll('[data-room-media-manager]').forEach(button => button.onclick = () => {
    if (!runtime.user) return toast('Şahsy media üçin Google bilen giriş ediň.');
    window.KlasUserMedia?.open?.();
  });
  root.querySelectorAll('[data-room-ai]').forEach(button => button.onclick = openAiAssistant);
  root.querySelectorAll('[data-room-privacy]').forEach(button => button.onclick = openPrivacyEditor);
  root.querySelectorAll('[data-room-media]').forEach(button => button.onclick = () => {
    const items = state.media.filter(own);
    const id = button.dataset.roomMedia;
    window.KlasMediaViewer?.open?.(items, id, {
      title: 'Meniň mediýam',
      canDelete: item => own(item),
      onDelete: item => window.KlasUserMedia?.remove?.([item.id])
    });
  });
  const postsRoot = root.querySelector('#roomPosts');
  if (postsRoot && typeof window.bindPosts === 'function') window.bindPosts(postsRoot);
}

function render() {
  const root = document.getElementById('page-room');
  if (!root) return;
  const p = profile();
  const state = bridge.getState();
  const stats = roomStats(state);
  const avatar = httpsUrl(p.avatarURL || p.avatar || '', true);
  root.innerHTML = `<div class="room-shell">
    <section class="card room-hero">
      <div class="room-cover"${coverStyle()}>
        <div class="room-identity"><img class="room-avatar" src="${safe(avatar || 'https://i.pravatar.cc/160?img=12')}" alt="${safe(p.fullName || 'Profil')}"><div class="room-name"><span class="room-status-pill">Şahsy otag</span><h1>${safe(p.fullName || 'Klas ulanyjysy')}</h1><p>${safe(roleLabel(p))}</p></div><div class="room-owner-actions"><button type="button" class="primary" data-room-edit-profile>Profili üýtget</button><button type="button" class="secondary" data-room-media-manager>Media</button></div></div>
      </div>
      <div class="room-summary"><div><b>${stats.posts}</b><small>Ýazgy</small></div><div><b>${stats.media}</b><small>Media</small></div><div><b>${stats.friends}</b><small>Dost</small></div><div><b>${safe(p.graduationYear || '—')}</b><small>Uçuryş</small></div></div>
    </section>
    ${tabsMarkup()}
    <div class="room-content">${contentMarkup(state, p)}</div>
  </div>`;
  bindRoomInteractions(root, state);
}

async function saveRoom(patch) {
  if (!runtime.user) throw new Error('Ilki Google bilen giriş ediň.');
  const uid = runtime.user.uid;
  const next = { ...room, ...patch, uid };
  await setDoc(doc(db, 'rooms', uid), {
    uid,
    coverURL: httpsUrl(next.coverURL || '', true),
    className: String(next.className || '').trim().slice(0, 20),
    interests: String(next.interests || '').trim().slice(0, 300),
    website: httpsUrl(next.website || '', true),
    profileVisibility: ['members', 'friends', 'private'].includes(next.profileVisibility) ? next.profileVisibility : 'members',
    mediaVisibility: ['members', 'friends', 'private'].includes(next.mediaVisibility) ? next.mediaVisibility : 'members',
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function openProfileEditor() {
  if (!runtime.user) {
    document.getElementById('authBtn')?.click();
    return;
  }
  const p = profile();
  bridge.openModal({
    title: 'Şahsy profili sazla',
    confirmText: 'Sakla',
    body: `<div class="form-grid"><div class="field"><label>Doly ady</label><input id="roomProfileName" maxlength="100" value="${safe(p.fullName || '')}"></div><div class="form-grid two"><div class="field"><label>Şäher</label><input id="roomProfileCity" maxlength="80" value="${safe(p.city || '')}"></div><div class="field"><label>Hünär</label><input id="roomProfileJob" maxlength="80" value="${safe(p.profession || '')}"></div></div><div class="field"><label>Bio</label><textarea id="roomProfileBio" maxlength="500">${safe(p.bio || '')}</textarea></div><div class="field"><label>Avatar suraty</label><input id="roomProfileAvatarFile" type="file" accept="image/*"></div><div class="field"><label>Ýa-da avatar URL</label><input id="roomProfileAvatarUrl" type="url" maxlength="2000" value="${safe(p.avatarURL || '')}"></div></div>`,
    onConfirm: async button => {
      const fullName = document.getElementById('roomProfileName').value.trim();
      if (!fullName) throw new Error('Doly adyňyzy ýazyň.');
      button.disabled = true;
      try {
        const file = document.getElementById('roomProfileAvatarFile').files[0];
        let avatarURL = document.getElementById('roomProfileAvatarUrl').value.trim();
        if (file) avatarURL = await uploadMedia(file, 'klas/avatars');
        await saveProfile({
          ...runtime.profile,
          fullName,
          shortName: fullName.split(/\s+/)[0],
          city: document.getElementById('roomProfileCity').value.trim(),
          profession: document.getElementById('roomProfileJob').value.trim(),
          bio: document.getElementById('roomProfileBio').value.trim(),
          avatarURL
        });
        bridge.closeModal();
        toast('Şahsy profil saklandy');
        render();
      } finally { button.disabled = false; }
    }
  });
}

function openRoomEditor() {
  if (!runtime.user) return document.getElementById('authBtn')?.click();
  bridge.openModal({
    title: 'Şahsy otagy sazla',
    confirmText: 'Sakla',
    body: `<div class="form-grid"><div class="field"><label>Gapak suraty</label><input id="roomCoverFile" type="file" accept="image/*"></div><div class="field"><label>Ýa-da gapak URL</label><input id="roomCoverUrl" type="url" maxlength="2000" value="${safe(room.coverURL || '')}"></div><div class="form-grid two"><div class="field"><label>Klas</label><input id="roomClassName" maxlength="20" value="${safe(room.className || '')}"></div><div class="field"><label>Web sahypa</label><input id="roomWebsite" type="url" maxlength="2000" value="${safe(room.website || '')}"></div></div><div class="field"><label>Gyzyklanmalar</label><textarea id="roomInterests" maxlength="300">${safe(room.interests || '')}</textarea></div></div>`,
    onConfirm: async button => {
      button.disabled = true;
      try {
        const file = document.getElementById('roomCoverFile').files[0];
        let coverURL = document.getElementById('roomCoverUrl').value.trim();
        if (file) coverURL = await uploadMedia(file, 'klas/covers');
        await saveRoom({
          coverURL,
          className: document.getElementById('roomClassName').value,
          website: document.getElementById('roomWebsite').value,
          interests: document.getElementById('roomInterests').value
        });
        bridge.closeModal();
        toast('Şahsy otag täzelendi');
      } finally { button.disabled = false; }
    }
  });
}

function openPrivacyEditor() {
  if (!runtime.user) return document.getElementById('authBtn')?.click();
  const options = value => `<option value="members" ${value === 'members' ? 'selected' : ''}>Klas agzalary</option><option value="friends" ${value === 'friends' ? 'selected' : ''}>Diňe dostlar</option><option value="private" ${value === 'private' ? 'selected' : ''}>Diňe men</option>`;
  bridge.openModal({
    title: 'Gizlinlik sazlamalary',
    confirmText: 'Sakla',
    body: `<div class="form-grid"><div class="field"><label>Profili kim görüp biler?</label><select id="roomProfileVisibility">${options(room.profileVisibility)}</select></div><div class="field"><label>Mediýany kim görüp biler?</label><select id="roomMediaVisibility">${options(room.mediaVisibility)}</select></div></div>`,
    onConfirm: async button => {
      button.disabled = true;
      try {
        await saveRoom({
          profileVisibility: document.getElementById('roomProfileVisibility').value,
          mediaVisibility: document.getElementById('roomMediaVisibility').value
        });
        bridge.closeModal();
        toast('Gizlinlik sazlamalary saklandy');
      } finally { button.disabled = false; }
    }
  });
}

async function requestAiBio(goal) {
  if (!runtime.user) throw new Error('AI kömekçisi üçin giriş ediň.');
  const endpoint = httpsUrl(config?.ai?.profileAssistantEndpoint || '', false);
  const token = await runtime.user.getIdToken();
  const p = profile();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      goal: String(goal || '').trim().slice(0, 600),
      profile: {
        fullName: p.fullName || '',
        city: p.city || '',
        profession: p.profession || '',
        school: p.school || '',
        graduationYear: p.graduationYear || '',
        className: room.className || '',
        interests: room.interests || '',
        currentBio: p.bio || ''
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true || !data.bio) throw new Error(data.error || `AI hyzmaty jogap bermedi (${response.status}).`);
  return String(data.bio).trim().slice(0, 500);
}

function openAiAssistant() {
  if (!runtime.user) return document.getElementById('authBtn')?.click();
  if (!config?.ai?.profileAssistantEndpoint) return toast('AI backend salgysy sazlanmady.');
  bridge.openModal({
    title: 'AI profil kömekçisi',
    confirmText: 'Bio taýýarla',
    body: '<div class="form-grid"><div class="field"><label>Bio nähili bolsun?</label><textarea id="roomAiGoal" maxlength="600" placeholder="Meselem: resmi, gysga we dostlukly görnüşde ýaz."></textarea></div><div id="roomAiStatus" class="room-public-note">Diňe profilde görkezilýän maglumatlar backend-e iberilýär.</div></div>',
    onConfirm: async button => {
      button.disabled = true;
      button.textContent = 'Taýýarlanýar…';
      try {
        const bio = await requestAiBio(document.getElementById('roomAiGoal').value);
        bridge.openModal({
          title: 'AI tarapyndan taýýarlanan bio',
          confirmText: 'Profiliň bio-sy et',
          body: `<div class="form-grid"><div class="field"><label>Netije</label><textarea id="roomAiBioResult" maxlength="500">${safe(bio)}</textarea></div></div>`,
          onConfirm: async saveButton => {
            saveButton.disabled = true;
            try {
              await saveProfile({ ...runtime.profile, bio: document.getElementById('roomAiBioResult').value.trim() });
              bridge.closeModal();
              toast('AI bio profilde saklandy');
              render();
            } finally { saveButton.disabled = false; }
          }
        });
      } finally {
        button.disabled = false;
        button.textContent = 'Bio taýýarla';
      }
    }
  });
}

function subscribeRoom() {
  stopRoom?.();
  stopRoom = null;
  room = { ...DEFAULT_ROOM };
  if (!runtime.user) {
    render();
    return;
  }
  const uid = runtime.user.uid;
  const reference = doc(db, 'rooms', uid);
  stopRoom = onSnapshot(reference, snapshot => {
    if (!snapshot.exists()) {
      setDoc(reference, {
        uid,
        ...DEFAULT_ROOM,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }).catch(error => handleError(error, 'Şahsy otag döredilmedi'));
      return;
    }
    room = { ...DEFAULT_ROOM, ...snapshot.data() };
    render();
  }, error => handleError(error, 'Şahsy otag ýüklenmedi'));
}

function install() {
  installStyles();
  installNavigation();
  installPage();
  window.renderPersonalRoom = render;
  window.addEventListener('klas-auth', subscribeRoom);
  window.addEventListener('klas-account', render);
  window.addEventListener('klas:statechange', event => {
    if (!event.detail?.collections || event.detail.collections.some(name => ['all', 'currentUser', 'posts', 'media', 'people'].includes(name))) render();
  });
  window.addEventListener('klas:pagechange', event => {
    if (event.detail?.page === 'room') render();
  });
  subscribeRoom();
  render();
}

install();

window.KlasPersonalRoom = Object.freeze({
  open: () => window.showPage?.('room'),
  render,
  editProfile: openProfileEditor,
  editRoom: openRoomEditor,
  editPrivacy: openPrivacyEditor,
  aiBio: openAiAssistant
});
