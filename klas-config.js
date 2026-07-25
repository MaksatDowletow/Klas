/**
 * Klas production configuration.
 * Firebase web config is intentionally public. Never add Cloudinary API Secret here.
 */
window.KLAS_CONFIG = Object.freeze({
  firebase: Object.freeze({
    apiKey: 'AIzaSyDn9b_0m15W5tk6fYq4PQwToJLwHHuFVYg',
    authDomain: 'project-789b5025-7a3c-4b74-88b.firebaseapp.com',
    projectId: 'project-789b5025-7a3c-4b74-88b',
    storageBucket: 'project-789b5025-7a3c-4b74-88b.firebasestorage.app',
    messagingSenderId: '608095045728',
    appId: '1:608095045728:web:aadf57f6b130927868db05'
  }),
  cloudinary: Object.freeze({
    cloudName: 'fitojlfl',
    uploadPreset: 'klas_unsigned',
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 50 * 1024 * 1024,
    deleteEndpoint: 'https://us-central1-project-789b5025-7a3c-4b74-88b.cloudfunctions.net/deleteMediaAsset'
  }),
  rtc: Object.freeze({
    iceServers: Object.freeze([
      Object.freeze({ urls: Object.freeze([
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
      ]) })
    ]),
    ringTimeoutMs: 45000,
    maxCallAgeMs: 60000,
    disconnectGraceMs: 12000
  }),
  presence: Object.freeze({
    heartbeatMs: 45000,
    staleMs: 105000,
    sweepMs: 15000,
    maxSessions: 500
  }),
  app: Object.freeze({
    version: '6.2.0',
    firebaseSdkVersion: '12.16.0',
    allowLocalFallback: true,
    dynamicPages: true,
    realtimeComments: true
  })
});
