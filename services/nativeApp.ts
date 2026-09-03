import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

export type SharedImagePayload = { dataUrl?: string; mimeType?: string };

export type NativeAppVersion = {
  packageName?: string;
  versionName?: string;
  versionCode?: number;
};

interface ThreadXNativePlugin {
  takePhoto(): Promise<{ dataUrl?: string; mimeType?: string; cancelled?: boolean }>;
  openWhatsAppWithText(options: { text: string }): Promise<void>;
  shareImages(options: { dataUrls: string[] }): Promise<void>;
  shareFile(options: { dataUrl: string; fileName: string; mimeType?: string }): Promise<void>;
  saveImageToDownloads(options: {
    dataUrl: string;
    fileName: string;
    mimeType?: string;
  }): Promise<{ saved: boolean; fileName?: string }>;
  getAppVersion(): Promise<NativeAppVersion>;
  openPlayStore(options?: { packageName?: string; webUrl?: string }): Promise<void>;
  /** Peek a gallery Share image that launched the app (does not clear it). */
  getPendingSharedImage(): Promise<SharedImagePayload>;
  clearPendingSharedImage(): Promise<void>;
  addListener(
    eventName: 'shareReceived',
    listenerFunc: (event: SharedImagePayload) => void
  ): Promise<PluginListenerHandle>;
}

const PLAY_STORE_PACKAGE = 'com.textilehub.catalogue';
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;

const ThreadXNative = registerPlugin<ThreadXNativePlugin>('ThreadXNative');

export const isNativeAndroid = () =>
  Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();

export const takePhotoFromNativeCamera = async (): Promise<string | null> => {
  const result = await ThreadXNative.takePhoto();
  return result.cancelled ? null : result.dataUrl || null;
};

export const openWhatsAppWithTextNative = async (text: string): Promise<void> => {
  await ThreadXNative.openWhatsAppWithText({ text });
};

export const shareImagesNative = async (dataUrls: string[]): Promise<void> => {
  await ThreadXNative.shareImages({ dataUrls });
};

/** Peek a gallery Share image that launched the app (cold start). */
export const getPendingSharedImage = async (): Promise<SharedImagePayload | null> => {
  if (!isNativeAndroid()) return null;
  try {
    const result = await ThreadXNative.getPendingSharedImage();
    return result?.dataUrl ? result : null;
  } catch {
    return null;
  }
};

export const clearPendingSharedImage = async (): Promise<void> => {
  if (!isNativeAndroid()) return;
  try {
    await ThreadXNative.clearPendingSharedImage();
  } catch {
    // ignore
  }
};

/** Listen for gallery Share while the app is already open. */
export const addShareReceivedListener = async (
  listener: (event: SharedImagePayload) => void
): Promise<PluginListenerHandle | null> => {
  if (!isNativeAndroid()) return null;
  try {
    return await ThreadXNative.addListener('shareReceived', listener);
  } catch {
    return null;
  }
};

export const saveImageToDownloadsNative = async (
  dataUrl: string,
  fileName: string,
  mimeType?: string
): Promise<void> => {
  await ThreadXNative.saveImageToDownloads({ dataUrl, fileName, mimeType });
};

export const shareFileNative = async (
  dataUrl: string,
  fileName: string,
  mimeType: string
): Promise<void> => {
  await ThreadXNative.shareFile({ dataUrl, fileName, mimeType });
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not prepare file for sharing'));
    reader.readAsDataURL(blob);
  });

export const openWhatsAppWithText = async (text: string): Promise<void> => {
  if (isNativeAndroid()) {
    await openWhatsAppWithTextNative(text);
    return;
  }

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  const newWindow = window.open(waUrl, '_blank');
  if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }
};

export const getNativeAppVersion = async (): Promise<NativeAppVersion | null> => {
  if (!isNativeAndroid()) return null;
  try {
    const result = await ThreadXNative.getAppVersion();
    return {
      packageName: result?.packageName,
      versionName: result?.versionName,
      versionCode: Number(result?.versionCode || 0) || undefined
    };
  } catch {
    return null;
  }
};

/** Opens the ThreadX listing in the Play Store app (falls back to the web URL). */
export const openPlayStoreListing = async (webUrl?: string): Promise<void> => {
  const url = webUrl || PLAY_STORE_WEB_URL;
  if (isNativeAndroid()) {
    try {
      await ThreadXNative.openPlayStore({
        packageName: PLAY_STORE_PACKAGE,
        webUrl: url
      });
      return;
    } catch {
      // fall through to browser URL
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const downloadDataUrl = async (
  dataUrl: string,
  fileName: string,
  mimeType?: string
): Promise<void> => {
  if (isNativeAndroid()) {
    await saveImageToDownloadsNative(dataUrl, fileName, mimeType);
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadBlob = async (blob: Blob, fileName: string): Promise<void> => {
  if (isNativeAndroid()) {
    const dataUrl = await blobToDataUrl(blob);
    await saveImageToDownloadsNative(dataUrl, fileName, blob.type || undefined);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
