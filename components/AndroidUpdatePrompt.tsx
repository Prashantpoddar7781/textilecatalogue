import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { appApi } from '../services/api';
import {
  getNativeAppVersion,
  isNativeAndroid,
  openPlayStoreListing
} from '../services/nativeApp';

/**
 * On Android, compares the installed versionCode with the backend "latest"
 * and prompts Update now / Skip. Skip only dismisses for this app session.
 */
export const AndroidUpdatePrompt: React.FC = () => {
  const [prompt, setPrompt] = useState<{
    latestVersionName: string;
    message: string;
    playStoreUrl: string;
  } | null>(null);
  const skippedThisSession = useRef(false);
  const promptOpen = useRef(false);
  const checking = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (!isNativeAndroid() || skippedThisSession.current || promptOpen.current || checking.current) {
      return;
    }
    checking.current = true;
    try {
      const installed = await getNativeAppVersion();
      if (!installed?.versionCode) return;

      const latest = await appApi.getAndroidVersion();
      const latestCode = Number(latest.latestVersionCode || 0);
      if (!Number.isFinite(latestCode) || latestCode <= installed.versionCode) return;

      promptOpen.current = true;
      setPrompt({
        latestVersionName: latest.latestVersionName || String(latestCode),
        message: latest.message || 'A new version of ThreadX is available.',
        playStoreUrl: latest.playStoreUrl || ''
      });
    } catch {
      // Offline / API down — do not block the app.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isNativeAndroid()) return;
    void checkForUpdate();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !skippedThisSession.current) {
        void checkForUpdate();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [checkForUpdate]);

  if (!prompt) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6">
        <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-4">
          <Download className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-black text-gray-900">Update available</h3>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          {prompt.message}
          {prompt.latestVersionName ? <> (v{prompt.latestVersionName})</> : null}
        </p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            className="flex-1 px-4 py-3 rounded-2xl border-2 border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50"
            onClick={() => {
              skippedThisSession.current = true;
              promptOpen.current = false;
              setPrompt(null);
            }}
          >
            Skip
          </button>
          <button
            type="button"
            className="flex-1 px-4 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700"
            onClick={() => {
              void openPlayStoreListing(prompt.playStoreUrl);
            }}
          >
            Update now
          </button>
        </div>
      </div>
    </div>
  );
};
