/**
 * Latest ThreadX Android build published (or about to publish) on Play Store.
 * Bump these when you upload a new AAB. Env vars override without a code change:
 *   ANDROID_LATEST_VERSION_CODE
 *   ANDROID_LATEST_VERSION_NAME
 *   ANDROID_PLAY_STORE_URL
 */
export const ANDROID_PACKAGE_ID = 'com.textilehub.catalogue';

export const ANDROID_LATEST_VERSION_CODE = Number(process.env.ANDROID_LATEST_VERSION_CODE || 31);

export const ANDROID_LATEST_VERSION_NAME = String(process.env.ANDROID_LATEST_VERSION_NAME || '1.0.30');

export const ANDROID_PLAY_STORE_URL =
  process.env.ANDROID_PLAY_STORE_URL ||
  `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;
