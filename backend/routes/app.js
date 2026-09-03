import express from 'express';
import {
  ANDROID_LATEST_VERSION_CODE,
  ANDROID_LATEST_VERSION_NAME,
  ANDROID_PACKAGE_ID,
  ANDROID_PLAY_STORE_URL
} from '../constants/androidAppVersion.js';

const router = express.Router();

/** Public: Android clients compare versionCode and prompt for Play Store update. */
router.get('/android-version', (_req, res) => {
  res.json({
    packageId: ANDROID_PACKAGE_ID,
    latestVersionCode: ANDROID_LATEST_VERSION_CODE,
    latestVersionName: ANDROID_LATEST_VERSION_NAME,
    playStoreUrl: ANDROID_PLAY_STORE_URL,
    message: `ThreadX ${ANDROID_LATEST_VERSION_NAME} is available on the Play Store.`
  });
});

export default router;
