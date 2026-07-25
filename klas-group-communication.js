import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { db, runtime, bridge, toast, handleError, timeLabel, config } from './klas-backend-core.js';

const MAX_VIDEO_PARTICIPANTS = 6;
let chatStop = null;
let participantStop = null;
let signalStop = null;
let localStream = null;
const peers = new Map();
const processedSignals = new Set();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function requireGroup(groupId){
  if (!runtime.user) throw new Error('Giriş gerek.');
  const snapshot = await getDoc(doc(db, 'groups', groupId));
  if (!snapshot.exists() || !(snapshot.data().memberIds || []).includes(runtime.user.uid)) throw new Error('Bu toparyň aragatnaşygyna rugsat ýok.');
  return { id:snapshot.id, ...snapshot.data() };
}

function installUi(){
  if (!document.getElementById('groupCommunicationStyles')) {
    const style=document.createElement('style'); style.id='groupCommunicationStyles';
    style.textContent='.group-com-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.group-chat-list{max-height:55vh;overflow:auto;display:grid;gap:10px}.group-chat-message{padding:10px 12px;border-radius:14px;background:var(--surface-2,#f3f4f6)}.group-chat-message.mine{margin-left:12%;background:var(--primary-soft,#e8f0ff)}.group-chat-message small{display:block;opacity:.7}.group-chat-form{display:flex;gap:8px;margin-top:12px}.group-chat-form input{flex:1}.group-video-layer{position:fixed;inset:0;z-index:1200;background:#0c1017;color:#fff;display:grid;grid-template-rows:auto 1fr auto;padding:16px}.group-video-layer.hidden{display:none}.group-video-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;overflow:auto}.group-video-tile{position:relative;background:#111827;border-radius:16px;overflow:hidden;min-height:180px}.group-video-tile video{width:100%;height:100%;object-fit:cover}.group-video-tile span{position:absolute;left:10px;bottom:8px;background:#0009;padding:4px 8px;border-radius:10px}.group-video-controls{display:flex;justify-content:center;gap:10px;padding-top:12px}';
    document.head.appendChild(style);
  }
  if (!document.getElementById('groupVideoLayer')) document.body.insertAdjacentHTML('beforeend','<section id="groupVideoLayer" class="group-video-layer hidden" aria-hidden="true"><header><h2 id="groupVideoTitle">Topar wideoçaty</h2><p id="groupVideoStatus">Taýýarlanýar…</p></header><div id="groupVideoGrid" class="group-video-grid"></div><div class="group-video-controls"><button id="groupVideoMic" type="button">🎙️</button><button id="groupVideoCamera" type="button">📷</button><button id="groupVideoLeave" class="danger" type="button">☎ Çyk</button></div></section>');
  document.getElementById('groupVideoLeave').onclick=leaveVideo;
  document.getElementById('groupVideoMic').onclick=()=>toggleTrack('audio');
  document.getElementById('groupVideoCamera').onclick=()=>toggleTrack('video');
}

function decorateGroups(){
  const groups=(bridge.getState?.().groups || []).filter(g=>g.remote&&g.joined);
  groups.forEach(group=>{
    const toggle=document.querySelector(`[data-group-toggle="${CSS.escape(group.id)}"]`);
    const card=toggle?.closest('article,.group-card,.card');
    if(!card||card.querySelector('.group-com-actions'))return;
    const actions=document.createElement('div'); actions.className='group-com-actions';
    actions.innerHTML=`<button type="button" class="secondary" data-group-chat="${esc(group.id)}">💬 Topar çaty</button><button type="button" class="secondary" data-group-video="${esc(group.id)}">📹 Topar wideoçaty</button>`;
    card.appendChild(actions);
  });
}

async function openChat(groupId){
  const group=await requireGroup(groupId); chatStop?.();
  bridge.openModal({title:`${group.name||'Topar'} · Çat`,hideConfirm:true,body:'<div id="groupChatMessages" class="group-chat-list" aria-live="polite"></div><form id="groupChatForm" class="group-chat-form"><input id="groupChatInput" maxlength="4000" placeholder="Topara habar ýazyň" required><button type="submit">Iber</button></form>'});
  const list=document.getElementById('groupChatMessages');
  chatStop=onSnapshot(query(collection(db,'groupConversations',groupId,'messages'),orderBy('createdAt','asc'),limit(300)),snapshot=>{
    list.innerHTML=snapshot.docs.map(item=>{const m=item.data();return `<div class="group-chat-message ${m.senderId===runtime.user.uid?'mine':''}"><b>${esc(m.senderName||'Agza')}</b><div>${esc(m.text||'')}</div><small>${esc(timeLabel(m.createdAt))}</small></div>`}).join('')||'<div class="empty">Heniz habar ýok.</div>'; list.scrollTop=list.scrollHeight;
  },error=>handleError(error,'Topar habarlary ýüklenmedi'));
  document.getElementById('groupChatForm').onsubmit=async event=>{
    event.preventDefault(); const input=document.getElementById('groupChatInput'); const text=input.value.trim(); if(!text)return;
    await addDoc(collection(db,'groupConversations',groupId,'messages'),{senderId:runtime.user.uid,senderName:runtime.profile?.shortName||runtime.user.displayName||'Agza',text,createdAt:serverTimestamp(),seenBy:[runtime.user.uid]});
    await setDoc(doc(db,'groupConversations',groupId),{groupId,groupName:group.name||'Topar',memberIds:group.memberIds||[],lastMessage:text,lastMessageAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true}); input.value='';
  };
}

function rtcConfig(){return {iceServers:Array.isArray(config?.rtc?.iceServers)&&config.rtc.iceServers.length?config.rtc.iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]};}
function tile(uid,name,stream,muted=false){let node=document.getElementById(`groupVideo-${uid}`);if(!node){node=document.createElement('div');node.id=`groupVideo-${uid}`;node.className='group-video-tile';node.innerHTML=`<video autoplay playsinline ${muted?'muted':''}></video><span>${esc(name)}</span>`;document.getElementById('groupVideoGrid').appendChild(node)}node.querySelector('video').srcObject=stream;}
function toggleTrack(kind){const track=(kind==='audio'?localStream?.getAudioTracks():localStream?.getVideoTracks())?.[0];if(track){track.enabled=!track.enabled;toast(track.enabled?`${kind==='audio'?'Mikrofon':'Kamera'} açyldy`:`${kind==='audio'?'Mikrofon':'Kamera'} ýapyldy`)}}
async function signal(groupId,to,type,payload){const value={from:runtime.user.uid,to,type,payload,updatedAt:serverTimestamp()};if(type==='candidate')await addDoc(collection(db,'groupCalls',groupId,'signals'),value);else await setDoc(doc(db,'groupCalls',groupId,'signals',`${type}_${runtime.user.uid}_${to}`),value);}
async function peer(groupId,remoteUid,initiator){
  if(peers.has(remoteUid))return peers.get(remoteUid); const pc=new RTCPeerConnection(rtcConfig()); peers.set(remoteUid,pc); localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack=e=>tile(remoteUid,runtime.profiles.get(remoteUid)?.fullName||'Topar agzasy',e.streams[0]); pc.onicecandidate=e=>{if(e.candidate)signal(groupId,remoteUid,'candidate',e.candidate.toJSON()).catch(()=>{})};
  if(initiator){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await signal(groupId,remoteUid,'offer',{type:offer.type,sdp:offer.sdp})} return pc;
}
async function receiveSignal(groupId,id,data){
  if(data.to!==runtime.user.uid||data.from===runtime.user.uid)return; const token=`${id}:${data.type}:${data.payload?.sdp||data.payload?.candidate||''}`; if(processedSignals.has(token))return; processedSignals.add(token);
  const pc=await peer(groupId,data.from,false); if(data.type==='offer'){if(!pc.currentRemoteDescription){await pc.setRemoteDescription(data.payload);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await signal(groupId,data.from,'answer',{type:answer.type,sdp:answer.sdp})}}else if(data.type==='answer'&&!pc.currentRemoteDescription)await pc.setRemoteDescription(data.payload);else if(data.type==='candidate')await pc.addIceCandidate(data.payload).catch(()=>{});
}

async function joinVideo(groupId){
  const group=await requireGroup(groupId); installUi();
  const activeSnapshot=await getDocs(query(collection(db,'groupCalls',groupId,'participants'),where('active','==',true),limit(MAX_VIDEO_PARTICIPANTS+1)));
  if(activeSnapshot.size>=MAX_VIDEO_PARTICIPANTS)throw new Error(`Wideo otagy doly. Iň köp ${MAX_VIDEO_PARTICIPANTS} gatnaşyjy.`);
  localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'}});
  const layer=document.getElementById('groupVideoLayer');layer.dataset.groupId=groupId;layer.classList.remove('hidden');layer.setAttribute('aria-hidden','false');document.getElementById('groupVideoTitle').textContent=`${group.name||'Topar'} · Wideoçat`;tile(runtime.user.uid,'Siz',localStream,true);
  await setDoc(doc(db,'groupCalls',groupId),{groupId,groupName:group.name||'Topar',memberIds:group.memberIds||[],active:true,updatedAt:serverTimestamp()},{merge:true});
  await setDoc(doc(db,'groupCalls',groupId,'participants',runtime.user.uid),{uid:runtime.user.uid,name:runtime.profile?.shortName||runtime.user.displayName||'Agza',joinedAt:serverTimestamp(),updatedAt:serverTimestamp(),active:true});
  participantStop=onSnapshot(collection(db,'groupCalls',groupId,'participants'),snapshot=>{const others=snapshot.docs.map(d=>d.data()).filter(p=>p.uid!==runtime.user.uid&&p.active);document.getElementById('groupVideoStatus').textContent=`${others.length+1} gatnaşyjy`;others.forEach(p=>peer(groupId,p.uid,runtime.user.uid.localeCompare(p.uid)<0).catch(error=>handleError(error,'Topar peer döredilmedi')))});
  signalStop=onSnapshot(query(collection(db,'groupCalls',groupId,'signals'),where('to','==',runtime.user.uid)),snapshot=>snapshot.docChanges().forEach(c=>receiveSignal(groupId,c.doc.id,c.doc.data()).catch(error=>handleError(error,'Wideo signal işlenmedi'))));
}

async function leaveVideo(){
  const layer=document.getElementById('groupVideoLayer');const groupId=layer?.dataset.groupId;if(groupId&&runtime.user)await updateDoc(doc(db,'groupCalls',groupId,'participants',runtime.user.uid),{active:false,leftAt:serverTimestamp(),updatedAt:serverTimestamp()}).catch(()=>{});
  participantStop?.();signalStop?.();participantStop=signalStop=null;peers.forEach(pc=>pc.close());peers.clear();processedSignals.clear();localStream?.getTracks().forEach(t=>t.stop());localStream=null;document.getElementById('groupVideoGrid')?.replaceChildren();if(layer){layer.classList.add('hidden');layer.setAttribute('aria-hidden','true');delete layer.dataset.groupId;}
}

document.addEventListener('click',event=>{const chat=event.target.closest('[data-group-chat]');if(chat){openChat(chat.dataset.groupChat).catch(e=>toast(e.message));return}const video=event.target.closest('[data-group-video]');if(video)joinVideo(video.dataset.groupVideo).catch(e=>toast(e.message));});
new MutationObserver(decorateGroups).observe(document.body,{childList:true,subtree:true});window.addEventListener('klas-auth',event=>{if(!event.detail?.user)leaveVideo();setTimeout(decorateGroups,400)});window.addEventListener('beforeunload',leaveVideo);installUi();setTimeout(decorateGroups,500);
window.KlasGroupCommunication=Object.freeze({openChat,joinVideo,leaveVideo,maxVideoParticipants:MAX_VIDEO_PARTICIPANTS});
