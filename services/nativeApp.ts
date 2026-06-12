import { Capacitor, registerPlugin } from '@capacitor/core';

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
}

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
