/**
 * Google Identity Services adapter (real mode). Loads the GIS script on demand and renders
 * Google's own button; the returned id token is exchanged with the API (POST /auth/google).
 */
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let loading = null;

function loadScript() {
  if (globalThis.google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(el);
  });
  return loading;
}

/** Renders the Google button into `container`; calls onCredential(idToken) after sign-in. */
export async function renderGoogleButton(
  container,
  { clientId, onCredential, text = 'continue_with' },
) {
  await loadScript();
  const gsi = globalThis.google.accounts.id;
  gsi.initialize({ client_id: clientId, callback: (res) => onCredential(res.credential) });
  gsi.renderButton(container, { theme: 'outline', size: 'large', text, width: 360, shape: 'pill' });
}
