import { runtime, bridge, toast, handleError } from './klas-backend-core.js';

const state = { observer:null };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function currentState(){ return bridge.getState?.() || {}; }
function role(){ return String(runtime.account?.role || runtime.profile?.role || runtime.profile?.publicRole || 'user').toLowerCase(); }
function isAdmin(){ return role() === 'admin'; }
function owns(item){
  const uid = runtime.user?.uid;
  return Boolean(uid && item?.ownerId && (item.ownerId === uid || item.ownerId === 'me'));
}

function installStyles(){
  if (document.getElementById('adminProfileMediaStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminProfileMediaStyles';
  style.textContent = `
    .admin-profile-card{display:grid;gap:12px;padding:16px;border:1px solid var(--border,#dbe1ea);border-radius:18px;background:linear-gradient(135deg,var(--surface,#fff),var(--surface-2,#f4f7fb))}
    .admin-profile-head{display:flex;align-items:center;gap:12px}.admin-profile-head img{width:58px;height:58px;border-radius:50%;object-fit:cover}
    .admin-role-badge{display:inline-flex;align-items:center;gap:6px;width:max-content;padding:5px 10px;border-radius:999px;font-size:.78rem;font-weight:700;background:var(--primary-soft,#e8f0ff);color:var(--primary,#285fc7)}
    .admin-profile-tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.admin-profile-tools button{text-align:left}
    .media-owner-shell{position:relative;display:grid;border-radius:16px;overflow:hidden}.media-owner-shell>.media-item{width:100%}
    .media-inline-owner-actions{display:flex;gap:6px;position:absolute;right:8px;top:8px;z-index:4;padding:5px;border-radius:12px;background:rgba(10,18,32,.76);backdrop-filter:blur(8px)}
    .media-inline-owner-actions button{min-width:38px;min-height:36px;border:0;border-radius:9px;cursor:pointer;background:#fff;color:#172033;font-weight:700}
    .media-inline-owner-actions button.danger{background:#ffe8ec;color:#b42343}
  `;
  document.head.appendChild(style);
}

function renderAdminProfile(){
  const settings = document.getElementById('page-settings');
  if (!settings) return;
  let card = document.getElementById('administratorProfileCard');
  if (!runtime.user || !isAdmin()) { card?.remove(); return; }
  const profile = runtime.profile || {};
  const name = profile.fullName || profile.shortName || runtime.user.displayName || 'Administrator';
  const avatar = profile.avatarURL || runtime.user.photoURL || '';
  if (!card) {
    card = document.createElement('section');
    card.id = 'administratorProfileCard';
    card.className = 'admin-profile-card';
    const anchor = settings.querySelector('.profile-summary');
    anchor?.insertAdjacentElement('afterend', card);
  }
  card.innerHTML = `<div class="admin-profile-head"><img src="${esc(avatar)}" alt=""><div><span class="admin-role-badge">🛡 Administrator</span><h3>${esc(name)}</h3><small>Ulanyjylar, ulgam ýagdaýy we moderasiýa üçin dolandyryş profili</small></div></div><div class="admin-profile-tools"><button type="button" class="secondary" data-admin-page="notifications">🔔 Moderasiýa bildirişleri</button><button type="button" class="secondary" data-admin-page="groups">🏫 Toparlar</button><button type="button" class="secondary" data-admin-page="settings">⚙ Ulgam ýagdaýy</button></div><small>Media eýeçilik amallary merkezi admin panelinde däl, her mediýanyň duran ýerinde görkezilýär. Administrator diňe aýratyn moderasiýa akymy arkaly başga ulanyjynyň mazmunyna täsir edip biler.</small>`;
}

function decorateMedia(){
  const media = currentState().media || [];
  document.querySelectorAll('#mediaGrid [data-media]').forEach(button => {
    const id = button.dataset.media;
    const item = media.find(value => String(value.id) === String(id));
    let shell = button.parentElement?.classList.contains('media-owner-shell') ? button.parentElement : null;
    if (!owns(item)) { shell?.querySelector('.media-inline-owner-actions')?.remove(); return; }
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'media-owner-shell';
      button.replaceWith(shell);
      shell.appendChild(button);
    }
    if (shell.querySelector('.media-inline-owner-actions')) return;
    const actions = document.createElement('div');
    actions.className = 'media-inline-owner-actions';
    actions.innerHTML = `<button type="button" data-inline-media-edit="${esc(id)}" aria-label="Media maglumatlaryny üýtget">✎</button><button type="button" class="danger" data-inline-media-delete="${esc(id)}" aria-label="Mediany doly poz">🗑</button>`;
    shell.appendChild(actions);
  });
}

function refresh(){ installStyles(); renderAdminProfile(); decorateMedia(); }

document.addEventListener('click', event => {
  const page = event.target.closest('[data-admin-page]');
  if (page) return document.querySelector(`[data-page="${CSS.escape(page.dataset.adminPage)}"]`)?.click();
  const edit = event.target.closest('[data-inline-media-edit]');
  if (edit) {
    event.preventDefault(); event.stopPropagation();
    return window.KlasUserMedia?.edit?.(edit.dataset.inlineMediaEdit) ?? toast('Media dolandyryşy taýýarlanýar');
  }
  const remove = event.target.closest('[data-inline-media-delete]');
  if (remove) {
    event.preventDefault(); event.stopPropagation();
    Promise.resolve(window.KlasUserMedia?.remove?.([remove.dataset.inlineMediaDelete])).catch(error => handleError(error,'Media pozulmady'));
  }
});

state.observer = new MutationObserver(() => queueMicrotask(refresh));
state.observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('klas-auth', () => setTimeout(refresh,250));
window.addEventListener('klas:statechange', () => queueMicrotask(refresh));
setTimeout(refresh,400);
window.KlasAdminProfileMedia = Object.freeze({ refresh, isAdmin, owns });
