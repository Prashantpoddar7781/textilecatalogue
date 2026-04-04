/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_API_URL?: string;
  /** OAuth 2.0 Web client ID — Google Drive picker */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Browser API key — Google Picker + Drive (restrict by HTTP referrer) */
  readonly VITE_GOOGLE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
