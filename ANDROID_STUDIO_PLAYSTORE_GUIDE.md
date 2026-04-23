# Android Studio Guide (Play Store Release)

This guide is for your current project setup (Vite + Capacitor + Android).

## 0) Prerequisites (one-time)

- Install Android Studio (latest stable).
- Install Android SDK + Platform Tools from Android Studio SDK Manager.
- Ensure JDK used by Android Studio is installed (bundled JDK is fine).

## 1) Sync latest web code into Android

From project root:

```bash
npm run android:sync
```

This does:

1. Build web app to `dist`
2. Copy web assets into Android app
3. Sync Capacitor plugins

## 2) Open native project in Android Studio

From project root:

```bash
npm run android:open
```

Android Studio opens the `android/` project.

## 3) Set app icon and app name

### App name

- File: `android/app/src/main/res/values/strings.xml`
- Update `app_name` and `title_activity_main` if needed.

### App icon

In Android Studio:

1. Right click `app` > `New` > `Image Asset`
2. Icon Type: `Launcher Icons (Adaptive and Legacy)`
3. Choose your logo image
4. Finish (this updates `mipmap-*` icons)

Recommended: 1024x1024 square source icon.

## 4) Release signing setup

You have two options:

### Option A (easiest, UI-based)

Use Android Studio wizard while generating bundle (it will create/select keystore for you).

### Option B (repeatable local setup)

1. Create `android/keystore.properties` (do not commit)
2. Use template: `android/keystore.properties.example`
3. Fill real values:

```properties
storeFile=../keystores/textilehub-upload-key.jks
storePassword=your_store_password
keyAlias=upload
keyPassword=your_key_password
```

Your `build.gradle` is already configured to use this automatically for release builds.

## 5) Update version before each production release

File: `android/app/build.gradle`

- `versionCode` must increase every release (1, 2, 3, ...)
- `versionName` is human-readable (`1.0.0`, `1.0.1`, ...)

## 6) Generate Play Store file (.aab)

In Android Studio:

1. `Build` > `Generate Signed Bundle / APK`
2. Select `Android App Bundle`
3. Select your keystore (or create one)
4. Build variant: `release`
5. Finish

Output typically:

- `android/app/release/app-release.aab`

## 7) Upload to Google Play Console

1. Open Play Console
2. Your app > `Production` > `Create new release`
3. Upload `app-release.aab`
4. Add release notes
5. Review and roll out to production

## 8) During Google review

Yes, you can continue feature development.

- Keep building in parallel.
- If you submit a new production build, review may restart for that build.
- Use `Internal testing` track for frequent tester builds without disturbing production rollout.
