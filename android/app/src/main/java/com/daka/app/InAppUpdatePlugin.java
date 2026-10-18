package com.daka.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "InAppUpdate")
public class InAppUpdatePlugin extends Plugin {

    @PluginMethod
    public void isNativeUpdater(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        ret.put("platform", "android");
        call.resolve(ret);
    }

    @PluginMethod
    public void checkDownloadedApk(PluginCall call) {
        Context context = getContext();
        File cacheDir = context.getExternalCacheDir();
        if (cacheDir == null) {
            cacheDir = context.getCacheDir();
        }
        File apkFile = new File(new File(cacheDir, "updates"), "daka-release-update.apk");
        JSObject ret = new JSObject();
        ret.put("exists", apkFile.exists() && apkFile.length() > 0);
        ret.put("fileSize", apkFile.exists() ? apkFile.length() : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void installDownloadedApk(PluginCall call) {
        Context context = getContext();
        File cacheDir = context.getExternalCacheDir();
        if (cacheDir == null) {
            cacheDir = context.getCacheDir();
        }
        File apkFile = new File(new File(cacheDir, "updates"), "daka-release-update.apk");
        if (!apkFile.exists() || apkFile.length() == 0) {
            call.reject("未找到已下载的安装包");
            return;
        }

        boolean ok = installApk(context, apkFile);
        JSObject ret = new JSObject();
        ret.put("success", ok);
        if (ok) {
            call.resolve(ret);
        } else {
            call.reject("呼起系统安装器失败");
        }
    }

    @PluginMethod
    public void startUpdate(PluginCall call) {
        String downloadUrl = call.getString("url");
        String expectedSha256 = call.getString("sha256", "");
        if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
            call.reject("更新包下载地址不能为空");
            return;
        }

        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream input = null;
            FileOutputStream output = null;
            File apkFile = null;
            try {
                Context context = getContext();
                URL u = new URL(downloadUrl);
                if (!"https".equalsIgnoreCase(u.getProtocol())) {
                    call.reject("更新包地址必须使用 https");
                    return;
                }

                // 支持最多 5 次 HTTP/HTTPS 及相对路径重定向
                int redirects = 0;
                while (redirects < 5) {
                    conn = (HttpURLConnection) u.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setInstanceFollowRedirects(false);
                    conn.connect();

                    int responseCode = conn.getResponseCode();
                    if (responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                        responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                        responseCode == HttpURLConnection.HTTP_SEE_OTHER ||
                        responseCode == 307 || responseCode == 308) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (location == null) {
                            call.reject("下载重定向失败：缺少 Location 标头");
                            return;
                        }
                        u = new URL(u, location);
                        if (!"https".equalsIgnoreCase(u.getProtocol())) {
                            call.reject("更新包重定向地址必须使用 https");
                            return;
                        }
                        redirects++;
                    } else if (responseCode == HttpURLConnection.HTTP_OK) {
                        break;
                    } else {
                        conn.disconnect();
                        call.reject("下载失败，HTTP状态码: " + responseCode);
                        return;
                    }
                }

                long fileLength = conn.getContentLengthLong();
                input = conn.getInputStream();

                File cacheDir = context.getExternalCacheDir();
                if (cacheDir == null) {
                    cacheDir = context.getCacheDir();
                }
                File updateDir = new File(cacheDir, "updates");
                if (!updateDir.exists()) {
                    updateDir.mkdirs();
                }
                apkFile = new File(updateDir, "daka-release-update.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                output = new FileOutputStream(apkFile);
                byte[] buffer = new byte[8192];
                long total = 0;
                int count;
                long lastNotifyTime = 0;

                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    output.write(buffer, 0, count);

                    long now = System.currentTimeMillis();
                    if (now - lastNotifyTime > 60 || total == fileLength) {
                        lastNotifyTime = now;
                        int percent = fileLength > 0 ? (int) (total * 100 / fileLength) : -1;
                        JSObject progressData = new JSObject();
                        progressData.put("percent", percent);
                        progressData.put("loaded", total);
                        progressData.put("total", fileLength);
                        notifyListeners("updateProgress", progressData);
                    }
                }

                output.flush();
                output.close();
                output = null;
                input.close();
                input = null;
                conn.disconnect();
                conn = null;

                // 安装包完整性校验：哈希不匹配时删除并拒绝安装
                if (expectedSha256 != null && !expectedSha256.isEmpty()) {
                    String actualSha256 = sha256(apkFile);
                    if (!actualSha256.equalsIgnoreCase(expectedSha256.trim())) {
                        apkFile.delete();
                        call.reject("安装包校验失败，已取消安装");
                        return;
                    }
                }

                // 完成通知
                JSObject completeData = new JSObject();
                completeData.put("percent", 100);
                completeData.put("filePath", apkFile.getAbsolutePath());
                notifyListeners("updateComplete", completeData);

                // 调用系统安装器，在软件内无缝呼出安装对话框，绝不跳转浏览器或下载器
                boolean installed = installApk(context, apkFile);

                JSObject res = new JSObject();
                res.put("success", true);
                res.put("installed", installed);
                call.resolve(res);

            } catch (Exception e) {
                if (apkFile != null && apkFile.exists()) {
                    try { apkFile.delete(); } catch (Exception ignored) {}
                }
                JSObject errData = new JSObject();
                errData.put("error", e.getMessage());
                notifyListeners("updateError", errData);
                call.reject("更新包下载失败: " + e.getMessage());
            } finally {
                try { if (output != null) output.close(); } catch (Exception ignored) {}
                try { if (input != null) input.close(); } catch (Exception ignored) {}
                try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
            }
        }).start();
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) {
            hex.append(String.format(Locale.US, "%02x", b));
        }
        return hex.toString();
    }

    private boolean installApk(Context context, File apkFile) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.getPackageManager().canRequestPackageInstalls()) {
                    Intent manageIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    manageIntent.setData(Uri.parse("package:" + context.getPackageName()));
                    manageIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(manageIntent);
                }
            }

            Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }
}
