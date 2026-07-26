const statusNode = document.getElementById('backendStatus');
const release = '20260726-cache-recovery1';
const styleHref = `./klas-livechat.css?v=${release}`;

if (![...document.styleSheets].some(sheet => sheet.href?.includes('klas-livechat.css'))) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = styleHref;
  document.head.appendChild(link);
}

try {
  await import(`./klas-cache-recovery.js?v=${release}`);
  await Promise.all([
    import(`./klas-backend-ui.js?v=${release}`),
    import(`./klas-backend-video.js?v=${release}`),
    import(`./klas-backend-realtime.js?v=${release}`),
    import(`./klas-backend-school-relations.js?v=${release}`),
    import(`./klas-registration-groups.js?v=${release}`),
    import(`./klas-group-communication.js?v=${release}`),
    import(`./klas-user-media.js?v=${release}`)
  ]);
} catch (error) {
  console.error('Klas backend başlangyjy başartmady', error);
  window.KlasRuntime?.reportError(error, 'backend:bootstrap');
  window.KlasBridge?.setCloudMode(false);
  if (statusNode) {
    statusNode.textContent = 'Ýerli režim · Firebase elýetersiz';
    statusNode.classList.add('error');
  }
  const authButton = document.getElementById('authBtn');
  if (authButton) {
    authButton.disabled = true;
    authButton.title = error?.message || 'Firebase modullary ýüklenmedi';
  }
}
