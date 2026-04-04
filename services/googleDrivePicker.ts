/**
 * Pick an image from the user's Google Drive using the Google Picker API.
 *
 * Requires in `.env` (Vite):
 *   VITE_GOOGLE_CLIENT_ID — OAuth 2.0 Web client ID
 *   VITE_GOOGLE_API_KEY — Browser API key (Picker + Drive; restrict by HTTP referrer)
 *
 * In Google Cloud Console: enable "Google Picker API" and "Google Drive API".
 */

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

let apisReady: Promise<void> | null = null;

async function ensureGooglePickerLoaded(): Promise<void> {
  if (apisReady) return apisReady;
  apisReady = (async () => {
    await loadScript('https://accounts.google.com/gsi/client');
    await loadScript('https://apis.google.com/js/api.js');
    await new Promise<void>((resolve, reject) => {
      const g = window.gapi;
      if (!g?.load) {
        reject(new Error('Google API failed to load'));
        return;
      }
      g.load('picker', {
        callback: () => resolve(),
        onerror: () => reject(new Error('Google Picker failed to load')),
      });
    });
  })();
  return apisReady;
}

async function downloadDriveFileAsDataUrl(fileId: string, accessToken: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Could not download file from Drive (${res.status}). ${t.slice(0, 120)}`);
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

export async function pickImageFromGoogleDrive(): Promise<string | null> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

  if (!clientId || !apiKey) {
    console.warn('Google Drive: OAuth credentials not configured for this deployment.');
    window.alert('Google Drive is not available. Please use Gallery or Camera to add your photo.');
    return null;
  }

  await ensureGooglePickerLoaded();

  const google = window.google;
  const gapi = window.gapi;
  if (!google?.accounts?.oauth2 || !google?.picker || !gapi) {
    throw new Error('Google libraries not ready');
  }

  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (tokenResponse: { access_token?: string; error?: string }) => {
        if (tokenResponse.error) {
          reject(new Error(tokenResponse.error));
          return;
        }
        const accessToken = tokenResponse.access_token;
        if (!accessToken) {
          reject(new Error('No access token'));
          return;
        }

        const picker = new google.picker.PickerBuilder()
          .addView(google.picker.ViewId.DOCS_IMAGES)
          .setOAuthToken(accessToken)
          .setDeveloperKey(apiKey)
          .setCallback((data: {
            [key: string]: unknown;
            action?: string;
          }) => {
            const Response = google.picker.Response;
            const Action = google.picker.Action;
            const action =
              (data[Response.ACTION] as string | undefined) ?? data.action;

            if (action === Action.PICKED) {
              const docs = data[Response.DOCUMENTS] as Array<{ id?: string }> | undefined;
              const doc = docs?.[0];
              const fileId = doc?.id;
              if (!fileId) {
                reject(new Error('No file selected'));
                return;
              }
              void downloadDriveFileAsDataUrl(fileId, accessToken).then(resolve).catch(reject);
            } else if (action === Action.CANCEL) {
              resolve(null);
            }
          })
          .build();
        picker.setVisible(true);
      },
    });

    tokenClient.requestAccessToken({ prompt: '' });
  });
}
