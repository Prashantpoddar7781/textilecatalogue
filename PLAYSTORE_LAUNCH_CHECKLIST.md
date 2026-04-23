# Play Store Launch Checklist (TextileHub)

## Current status

- Capacitor configured (`capacitor.config.ts`)
- Android project created in `android/`
- NPM scripts added:
  - `npm run android:sync`
  - `npm run android:open`

## 1) One-time setup in Google Play Console

1. Create a Google Play Console developer account.
2. Create a new app:
   - App name: TextileHub
   - Default language: English (or your preferred language)
   - App type: App
   - Paid/Free: choose now (cannot switch from paid to free later)
3. Complete mandatory Play Console forms:
   - App access
   - Ads declaration
   - Content rating
   - Target audience
   - Data safety

## 2) Configure Android app metadata

Before first upload, confirm/update:

- Package/app ID in `capacitor.config.ts`
  - Current: `com.textilehub.catalogue`
- App icon and splash assets in Android Studio
- Versioning in Android (`versionCode`, `versionName`)

## 3) Build an Android App Bundle (.aab)

1. Sync web + native:
   - `npm run android:sync`
2. Open native project:
   - `npm run android:open`
3. In Android Studio:
   - Build > Generate Signed Bundle / APK
   - Choose Android App Bundle
   - Create or use upload keystore
   - Build `release` bundle

Generated file is usually under:

- `android/app/release/app-release.aab`

## 4) Upload for review

1. In Play Console, create a Production release.
2. Upload `.aab`.
3. Add release notes.
4. Submit for review.

## 5) While review is in progress

You can continue building features and fixing bugs.

- If you submit a NEW production update while one is in review, review can restart for the new submission.
- Best workflow:
  - Keep working on `main`/feature branches
  - Upload urgent fixes only if needed
  - Use Internal testing track for frequent testing releases

## Suggested release workflow

1. Keep developing normally.
2. Use Internal testing for frequent app builds.
3. Freeze a release candidate branch when ready for production.
4. Submit production build for review.
5. Continue development for the next version in parallel.
