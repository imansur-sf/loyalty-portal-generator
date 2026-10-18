// Hosted LPG uses its own server for the shared widget and accounts API.
// The downloadable standalone editor retains the direct accounts endpoint.
window.saasyAuthReady = new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = window.LPG_STANDALONE || location.protocol === 'file:'
    ? 'https://sassysolutions-accounts-8215113235cf.aster-virginia.herokuapp.com/saasy-auth.js'
    : '/saasy-auth.js';
  script.onload = () => window.SaasyAuth ? resolve(window.SaasyAuth) : reject(new Error('Sign-in service is unavailable. Please reload and try again.'));
  script.onerror = () => reject(new Error('Sign-in service is unavailable. Your draft is still available in this browser. Please reload and try again.'));
  document.head.appendChild(script);
});
// Avoid an unhandled rejection if the network fails before the editor starts.
window.saasyAuthReady.catch(() => {});
