package com.textilehub.catalogue;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;

@CapacitorPlugin(name = "ThreadXNative")
public class ThreadXNativePlugin extends Plugin {
    private Uri cameraOutputUri;
    /** Shared gallery image waiting for the web app to consume (cold start). */
    private JSObject pendingSharedImage;
    private String lastProcessedShareKey;

    @Override
    public void load() {
        publishShareShortcut();
        processShareIntent(getActivity() != null ? getActivity().getIntent() : null);
    }

    @Override
    protected void handleOnStart() {
        super.handleOnStart();
        publishShareShortcut();
        processShareIntent(getActivity() != null ? getActivity().getIntent() : null);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (getActivity() != null && intent != null) {
            getActivity().setIntent(intent);
        }
        processShareIntent(intent);
    }

    /**
     * Returns a pending shared image from gallery Share without consuming it.
     */
    @PluginMethod
    public void getPendingSharedImage(PluginCall call) {
        call.resolve(pendingSharedImage != null ? pendingSharedImage : new JSObject());
    }

    @PluginMethod
    public void clearPendingSharedImage(PluginCall call) {
        pendingSharedImage = null;
        call.resolve();
    }

    private void publishShareShortcut() {
        try {
            Intent shortcutIntent = new Intent(getContext(), MainActivity.class);
            shortcutIntent.setAction(Intent.ACTION_SEND);
            shortcutIntent.setType("image/*");
            ShortcutInfoCompat shortcut = new ShortcutInfoCompat.Builder(getContext(), "share_upload_design")
                .setShortLabel("Upload design")
                .setLongLabel("Upload design to ThreadX")
                .setIcon(IconCompat.createWithResource(getContext(), R.mipmap.ic_launcher))
                .setIntent(shortcutIntent)
                .setCategories(Collections.singleton("com.textilehub.catalogue.share.IMAGE"))
                .build();
            ShortcutManagerCompat.pushDynamicShortcut(getContext(), shortcut);
        } catch (Exception ignored) {
            // Direct Share is best-effort; intent-filters still register the app.
        }
    }

    private void processShareIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return;
        }
        String type = intent.getType();
        if (type != null && !type.startsWith("image/") && !"*/*".equals(type)) {
            return;
        }

        Uri uri = null;
        if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        } else {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris != null && !uris.isEmpty()) {
                uri = uris.get(0);
            }
        }
        if (uri == null && intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {
            uri = intent.getClipData().getItemAt(0).getUri();
        }
        if (uri == null) return;

        String shareKey = action + "|" + uri;
        if (shareKey.equals(lastProcessedShareKey)) {
            return;
        }

        try {
            JSObject data = uriToSharedImage(uri);
            if (data == null) return;
            lastProcessedShareKey = shareKey;
            pendingSharedImage = data;
            notifyListeners("shareReceived", data);
        } catch (Exception error) {
            // Ignore unreadable share URIs; user can still upload manually.
        }
    }

    private JSObject uriToSharedImage(Uri uri) throws Exception {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) return null;

            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }

            String mimeType = getContext().getContentResolver().getType(uri);
            if (mimeType == null || !mimeType.startsWith("image/")) {
                mimeType = "image/jpeg";
            }

            String base64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
            JSObject data = new JSObject();
            data.put("dataUrl", "data:" + mimeType + ";base64," + base64);
            data.put("mimeType", mimeType);
            return data;
        }
    }

    @PluginMethod
    public void takePhoto(PluginCall call) {
        try {
            File photoFile = new File(getContext().getCacheDir(), "camera_" + System.currentTimeMillis() + ".jpg");
            cameraOutputUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                photoFile
            );

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(call, intent, "takePhotoResult");
        } catch (Exception error) {
            call.reject("Could not open camera", error);
        }
    }

    @ActivityCallback
    private void takePhotoResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || cameraOutputUri == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }

        try (InputStream input = getContext().getContentResolver().openInputStream(cameraOutputUri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) {
                call.reject("Could not read camera photo");
                return;
            }

            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }

            String base64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
            JSObject response = new JSObject();
            response.put("dataUrl", "data:image/jpeg;base64," + base64);
            response.put("mimeType", "image/jpeg");
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not read camera photo", error);
        } finally {
            cameraOutputUri = null;
        }
    }

    @PluginMethod
    public void openWhatsAppWithText(PluginCall call) {
        String text = call.getString("text", "");
        try {
            String url = "https://api.whatsapp.com/send?text=" + Uri.encode(text);
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open WhatsApp", error);
        }
    }

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            String packageName = getContext().getPackageName();
            PackageInfo info = getContext().getPackageManager().getPackageInfo(packageName, 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
            JSObject response = new JSObject();
            response.put("packageName", packageName);
            response.put("versionName", info.versionName != null ? info.versionName : "");
            response.put("versionCode", versionCode);
            call.resolve(response);
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("Could not read app version", error);
        }
    }

    @PluginMethod
    public void openPlayStore(PluginCall call) {
        String packageName = call.getString("packageName", getContext().getPackageName());
        String webUrl = call.getString(
            "webUrl",
            "https://play.google.com/store/apps/details?id=" + packageName
        );
        try {
            Intent marketIntent = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("market://details?id=" + packageName)
            );
            marketIntent.setPackage("com.android.vending");
            if (marketIntent.resolveActivity(getContext().getPackageManager()) != null) {
                getActivity().startActivity(marketIntent);
            } else {
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(webUrl));
                getActivity().startActivity(webIntent);
            }
            call.resolve();
        } catch (Exception error) {
            try {
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(webUrl));
                getActivity().startActivity(webIntent);
                call.resolve();
            } catch (Exception fallbackError) {
                call.reject("Could not open Play Store", fallbackError);
            }
        }
    }

    @PluginMethod
    public void shareImages(PluginCall call) {
        JSArray dataUrls = call.getArray("dataUrls");
        if (dataUrls == null || dataUrls.length() == 0) {
            call.reject("No images to share");
            return;
        }

        try {
            ArrayList<Uri> uris = new ArrayList<>();
            for (int i = 0; i < dataUrls.length(); i++) {
                String dataUrl = dataUrls.getString(i);
                byte[] bytes = decodeDataUrl(dataUrl);
                if (bytes == null) continue;

                File file = new File(getContext().getCacheDir(), "share_" + System.currentTimeMillis() + "_" + i + ".jpg");
                try (FileOutputStream output = new FileOutputStream(file)) {
                    output.write(bytes);
                }

                Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
                );
                uris.add(uri);
            }

            if (uris.isEmpty()) {
                call.reject("Could not prepare images to share");
                return;
            }

            // Single ACTION_SEND keeps WhatsApp on the photo preview (HD quality picker).
            Intent intent;
            if (uris.size() == 1) {
                intent = new Intent(Intent.ACTION_SEND);
                intent.setType("image/jpeg");
                intent.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            } else {
                intent = new Intent(Intent.ACTION_SEND_MULTIPLE);
                intent.setType("image/jpeg");
                intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            }
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // ClipData is required so WhatsApp receives read permission on every URI.
            ClipData clipData = ClipData.newUri(getContext().getContentResolver(), "images", uris.get(0));
            for (int i = 1; i < uris.size(); i++) {
                clipData.addItem(new ClipData.Item(uris.get(i)));
            }
            intent.setClipData(clipData);

            Intent chooser = Intent.createChooser(intent, "Share designs");
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not share images", error);
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String dataUrl = call.getString("dataUrl");
        String fileName = call.getString("fileName", "file.pdf");
        String mimeType = call.getString("mimeType");
        if (dataUrl == null || dataUrl.isEmpty()) {
            call.reject("File data is required");
            return;
        }

        try {
            byte[] bytes = decodeDataUrl(dataUrl);
            if (bytes == null) {
                call.reject("Invalid file data");
                return;
            }

            if (mimeType == null || mimeType.isEmpty()) {
                mimeType = getMimeType(dataUrl, fileName);
            }

            File file = new File(getContext().getCacheDir(), sanitizeFileName(fileName));
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(bytes);
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(intent, "Share file");
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not share file", error);
        }
    }

    @PluginMethod
    public void saveImageToDownloads(PluginCall call) {
        String dataUrl = call.getString("dataUrl");
        String fileName = call.getString("fileName", "image.png");
        String mimeTypeOverride = call.getString("mimeType");
        if (dataUrl == null || dataUrl.isEmpty()) {
            call.reject("Image data is required");
            return;
        }

        try {
            byte[] bytes = decodeDataUrl(dataUrl);
            if (bytes == null) {
                call.reject("Invalid image data");
                return;
            }

            String mimeType = (mimeTypeOverride != null && !mimeTypeOverride.isEmpty())
                ? mimeTypeOverride
                : getMimeType(dataUrl, fileName);
            if (!fileName.contains(".")) {
                if (mimeType.equals("image/png")) {
                    fileName += ".png";
                } else if (mimeType.equals("application/pdf")) {
                    fileName += ".pdf";
                } else {
                    fileName += ".jpg";
                }
            }

            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            }

            Uri collection = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? MediaStore.Downloads.EXTERNAL_CONTENT_URI
                : MediaStore.Files.getContentUri("external");

            Uri itemUri = getContext().getContentResolver().insert(collection, values);
            if (itemUri == null) {
                call.reject("Could not save file");
                return;
            }

            try (OutputStream output = getContext().getContentResolver().openOutputStream(itemUri)) {
                if (output == null) {
                    call.reject("Could not write file");
                    return;
                }
                output.write(bytes);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(itemUri, values, null, null);
            }

            JSObject response = new JSObject();
            response.put("saved", true);
            response.put("fileName", fileName);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not save image", error);
        }
    }

    private byte[] decodeDataUrl(String dataUrl) {
        if (dataUrl == null) return null;
        int commaIndex = dataUrl.indexOf(',');
        if (commaIndex < 0) return null;
        String base64 = dataUrl.substring(commaIndex + 1);
        return Base64.decode(base64, Base64.DEFAULT);
    }

    private String getMimeType(String dataUrl, String fileName) {
        if (dataUrl != null && dataUrl.startsWith("data:")) {
            int semi = dataUrl.indexOf(';');
            if (semi > 5) {
                return dataUrl.substring(5, semi);
            }
        }
        if (fileName != null) {
            String lower = fileName.toLowerCase();
            if (lower.endsWith(".pdf")) return "application/pdf";
            if (lower.endsWith(".png")) return "image/png";
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        }
        return "image/jpeg";
    }

    private String sanitizeFileName(String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            return "file_" + System.currentTimeMillis();
        }
        return fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
