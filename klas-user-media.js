import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { db, runtime, bridge, toast, handleError, normalizeHttpUrl, timeLabel } from './klas-backend-core.js';

const state = { items: [], albums: [], selected: new Set(), stopMedia: null, stopAlbums: null };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const clean = (value, max) => String(value ?? '').trim().slice(0, max);

function requireUser(){
  if (!runtime.user) throw new Error('Ilki Google bilen giriş ediň.');
  return runtime.user;
}

function installStyles(){
  if (document.getElementById('userMediaStyles')) return;
  const style = document.createElement('style');
  style.id = 'userMediaStyles';
  style.textContent = `
    .my-media-launch{position:fixed;right:18px;bottom:84px;z-index:35;border-radius:999px;box-shadow:0 10px 28px #0002}
    .media-manager-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
    .media-manager-toolbar input,.media-manager-toolbar select{min-height:42px}
    .media-manager-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;max-height:58vh;overflow:auto;padding:2px}
    .media-manager-card{position:relative;border:1px solid var(--border,#dbe1ea);border-radius:16px;overflow:hidden;background:var(--surface,#fff)}
    .media-manager-card.selected{outline:3px solid var(--primary,#356ae6)}
    .media-manager-card img,.media-manager-card video{width:100%;aspect-ratio:1/1;object-fit:cover;background:#111}
    .media-manager-meta{padding:10px;display:grid;gap:5px}.media-manager-meta small{opacity:.7}
    .media-manager-actions{display:flex;gap:6px;flex-wrap:wrap;padding:0 10px 10px}
    .media-manager-check{position:absolute;top:8px;left:8px;z-index:2;width:22px;height:22px}
    .media-manager-empty{padding:28px;text-align:center;opacity:.75}
    @media(max-width:760px){.my-media-launch{right:12px;bottom:76px}.media-manager-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);
}

function albumName(id){ return state.albums.find(album => album.id === id)?.name || 'Albom ýok'; }

function filteredItems(){
  const search = clean(document.getElementById('mediaManagerSearch')?.value, 100).toLocaleLowerCase('tk-TM');
  const album = document.getElementById('mediaManagerAlbumFilter')?.value || 'all';
  const type = document.getElementById('mediaManagerTypeFilter')?.value || 'all';
  return state.items.filter(item => {
    if (album !== 'all' && (item.albumId || '') !== album) return false;
    if (type !== 'all' && item.type !== type) return false;
    return !search || `${item.title || ''} ${item.description || ''}`.toLocaleLowerCase('tk-TM').includes(search);
  });
}

function render(){
  const grid = document.getElementById('mediaManagerGrid');
  if (!grid) return;
  const items = filteredItems();
  grid.innerHTML = items.map(item => {
    const selected = state.selected.has(item.id);
    const preview = item.type === 'video'
      ? `<video src="${esc(item.src)}" muted preload="metadata"></video>`
      : `<img src="${esc(item.src)}" alt="${esc(item.title || 'Media')}" loading="lazy">`;
    return `<article class="media-manager-card ${selected ? 'selected' : ''}" data-media-card="${esc(item.id)}">
      <input class="media-manager-check" type="checkbox" data-media-select="${esc(item.id)}" ${selected ? 'checked' : ''} aria-label="Saýla">
      ${preview}
      <div class="media-manager-meta"><b>${esc(item.title || 'Media')}</b><small>${esc(albumName(item.albumId))} · ${esc(item.visibility || 'public')}</small><small>${esc(timeLabel(item.createdAt))}</small></div>
      <div class="media-manager-actions"><button type="button" class="secondary" data-media-open="${esc(item.id)}">Aç</button><button type="button" class="secondary" data-media-edit="${esc(item.id)}">Üýtget</button><button type="button" class="danger" data-media-delete="${esc(item.id)}">Poz</button></div>
    </article>`;
  }).join('') || '<div class="media-manager-empty">Şertlere laýyk media tapylmady.</div>';
  const count = document.getElementById('mediaManagerCount');
  if (count) count.textContent = `${items.length} media · ${state.selected.size} saýlandy`;
}

function refreshAlbumOptions(){
  const options = state.albums.map(album => `<option value="${esc(album.id)}">${esc(album.name)}</option>`).join('');
  const filter = document.getElementById('mediaManagerAlbumFilter');
  if (filter) filter.innerHTML = `<option value="all">Ähli albomlar</option><option value="">Albom ýok</option>${options}`;
  render();
}

async function createAlbum(){
  const user = requireUser();
  const name = clean(prompt('Täze albomyň ady:'), 80);
  if (!name) return;
  await addDoc(collection(db, 'mediaAlbums'), { ownerId:user.uid, name, description:'', visibility:'public', createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  toast('Albom döredildi');
}

async function editItem(id){
  const item = state.items.find(value => value.id === id);
  if (!item) return;
  const albumOptions = `<option value="">Albom ýok</option>${state.albums.map(album => `<option value="${esc(album.id)}" ${album.id === item.albumId ? 'selected' : ''}>${esc(album.name)}</option>`).join('')}`;
  bridge.openModal({
    title:'Media maglumatlaryny üýtget', confirmText:'Sakla', cancelText:'Ýatyr',
    body:`<div class="form-grid"><div class="field"><label>Ady</label><input id="mediaEditTitle" maxlength="100" value="${esc(item.title || '')}"></div><div class="field"><label>Beýan</label><textarea id="mediaEditDescription" maxlength="500">${esc(item.description || '')}</textarea></div><div class="form-grid two"><div class="field"><label>Albom</label><select id="mediaEditAlbum">${albumOptions}</select></div><div class="field"><label>Görünijilik</label><select id="mediaEditVisibility"><option value="public" ${item.visibility !== 'private' ? 'selected' : ''}>Ählä görünýär</option><option value="private" ${item.visibility === 'private' ? 'selected' : ''}>Diňe maňa</option></select></div></div></div>`,
    onConfirm:async button => {
      button.disabled = true;
      try {
        await updateDoc(doc(db, 'media', id), {
          title:clean(document.getElementById('mediaEditTitle').value,100) || 'Media',
          description:clean(document.getElementById('mediaEditDescription').value,500),
          albumId:document.getElementById('mediaEditAlbum').value,
          visibility:document.getElementById('mediaEditVisibility').value === 'private' ? 'private' : 'public',
          updatedAt:serverTimestamp()
        });
        bridge.closeModal(); toast('Media täzelendi');
      } finally { button.disabled = false; }
    }
  });
}

async function deleteItems(ids){
  const unique = [...new Set(ids)].filter(id => state.items.some(item => item.id === id));
  if (!unique.length || !confirm(`${unique.length} media ýazgysyny pozmalymy?`)) return;
  const batch = writeBatch(db);
  unique.forEach(id => batch.delete(doc(db, 'media', id)));
  await batch.commit();
  unique.forEach(id => state.selected.delete(id));
  toast(`${unique.length} media ýazgysy pozuldy`);
}

async function moveSelected(){
  if (!state.selected.size) return toast('Ilki media saýlaň');
  const choices = ['Albom ýok', ...state.albums.map(album => album.name)];
  const answer = prompt(`Albomy saýlaň:\n${choices.map((name,index)=>`${index}: ${name}`).join('\n')}`, '0');
  if (answer === null) return;
  const index = Number(answer);
  if (!Number.isInteger(index) || index < 0 || index >= choices.length) throw new Error('Albom saýlawy nädogry.');
  const albumId = index === 0 ? '' : state.albums[index - 1].id;
  const batch = writeBatch(db);
  state.selected.forEach(id => batch.update(doc(db,'media',id), { albumId, updatedAt:serverTimestamp() }));
  await batch.commit(); toast('Saýlanan media alboma geçirildi');
}

function openViewer(id){
  const index = state.items.findIndex(item => item.id === id);
  if (index < 0) return;
  window.KlasMediaViewer?.open?.(state.items.map(item => ({ ...item, description:item.description || '' })), index, {
    title:'Meniň mediäm',
    canDelete:item => item.ownerId === runtime.user?.uid,
    onDelete:item => deleteItems([item.id])
  });
}

function openManager(){
  requireUser();
  bridge.openModal({
    title:'Meniň mediäm', hideConfirm:true,
    body:`<div class="media-manager-toolbar"><input id="mediaManagerSearch" placeholder="Media gözle"><select id="mediaManagerAlbumFilter"></select><select id="mediaManagerTypeFilter"><option value="all">Ähli görnüşler</option><option value="image">Suratlar</option><option value="video">Wideolar</option></select><button id="mediaCreateAlbum" type="button" class="secondary">+ Albom</button><button id="mediaMoveSelected" type="button" class="secondary">Alboma geçir</button><button id="mediaDeleteSelected" type="button" class="danger">Saýlananlary poz</button></div><div id="mediaManagerCount"></div><div id="mediaManagerGrid" class="media-manager-grid"></div>`
  });
  refreshAlbumOptions();
  document.getElementById('mediaManagerSearch').oninput = render;
  document.getElementById('mediaManagerAlbumFilter').onchange = render;
  document.getElementById('mediaManagerTypeFilter').onchange = render;
  document.getElementById('mediaCreateAlbum').onclick = () => createAlbum().catch(error => handleError(error,'Albom döredilmedi'));
  document.getElementById('mediaMoveSelected').onclick = () => moveSelected().catch(error => handleError(error,'Media alboma geçirilmedi'));
  document.getElementById('mediaDeleteSelected').onclick = () => deleteItems([...state.selected]).catch(error => handleError(error,'Media pozulmady'));
}

function installLauncher(){
  if (document.getElementById('myMediaBtn')) return;
  const button = document.createElement('button');
  button.id = 'myMediaBtn'; button.type = 'button'; button.className = 'primary my-media-launch'; button.textContent = '🖼 Meniň mediäm';
  button.onclick = () => { try { openManager(); } catch(error) { toast(error.message); } };
  document.body.appendChild(button);
}

function start(){
  stop();
  if (!runtime.user) return;
  const uid = runtime.user.uid;
  state.stopMedia = onSnapshot(query(collection(db,'media'), where('ownerId','==',uid), orderBy('createdAt','desc'), limit(500)), snapshot => {
    state.items = snapshot.docs.map(item => ({ id:item.id, ...item.data(), visibility:item.data().visibility || 'public', description:item.data().description || '', albumId:item.data().albumId || '' }));
    render();
  }, error => handleError(error,'Şahsy media sanawy ýüklenmedi'));
  state.stopAlbums = onSnapshot(query(collection(db,'mediaAlbums'), where('ownerId','==',uid), orderBy('createdAt','desc'), limit(100)), snapshot => {
    state.albums = snapshot.docs.map(item => ({ id:item.id, ...item.data() })); refreshAlbumOptions();
  }, error => handleError(error,'Albomlar ýüklenmedi'));
  installLauncher();
}

function stop(){ state.stopMedia?.(); state.stopAlbums?.(); state.stopMedia = state.stopAlbums = null; state.items = []; state.albums = []; state.selected.clear(); document.getElementById('myMediaBtn')?.remove(); }

document.addEventListener('change', event => { const input = event.target.closest('[data-media-select]'); if (!input) return; input.checked ? state.selected.add(input.dataset.mediaSelect) : state.selected.delete(input.dataset.mediaSelect); render(); });
document.addEventListener('click', event => { const open = event.target.closest('[data-media-open]'); if (open) return openViewer(open.dataset.mediaOpen); const edit = event.target.closest('[data-media-edit]'); if (edit) return editItem(edit.dataset.mediaEdit).catch(error=>handleError(error,'Media täzelenmedi')); const remove = event.target.closest('[data-media-delete]'); if (remove) return deleteItems([remove.dataset.mediaDelete]).catch(error=>handleError(error,'Media pozulmady')); });
window.addEventListener('klas-auth', event => event.detail?.user ? start() : stop());
installStyles(); if (runtime.user) start();
window.KlasUserMedia = Object.freeze({ open:openManager, edit:editItem, remove:deleteItems, createAlbum, moveSelected });
