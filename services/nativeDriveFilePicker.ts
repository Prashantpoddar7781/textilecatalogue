import { Capacitor, registerPlugin } from '@capacitor/core';

interface DriveFilePickerPlugin {
  pickImage(): Promise<{ dataUrl?: string; mimeType?: string; cancelled?: boolean }>;
}

const DriveFilePicker = registerPlugin<DriveFilePickerPlugin>('DriveFilePicker');

export const isNativeDrivePickerAvailable = () => Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();

export const pickImageFromNativeDrive = async (): Promise<string | null> => {
  const result = await DriveFilePicker.pickImage();
  return result.cancelled ? null : result.dataUrl || null;
};
