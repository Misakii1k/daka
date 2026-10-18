package com.daka.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        ret.put("platform", "android");
        call.resolve(ret);
    }

    /**
     * 将长图真实保存到系统公共相册中
     */
    @PluginMethod
    public void saveImageToGallery(PluginCall call) {
        String base64Data = call.getString("base64");
        String filename = call.getString("filename", "daka-export-" + System.currentTimeMillis() + ".png");
        filename = new File(filename).getName();

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("缺少图像 Base64 数据");
            return;
        }

        try {
            // 清理前缀
            String clean = base64Data.replaceFirst("^data:image/\\w+;base64,", "");
            byte[] bytes = Base64.decode(clean, Base64.DEFAULT);

            Context context = getContext();
            ContentResolver resolver = context.getContentResolver();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/DakaWorklog");

                Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (OutputStream os = resolver.openOutputStream(uri)) {
                        if (os != null) {
                            os.write(bytes);
                            os.flush();
                        }
                    }
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("uri", uri.toString());
                    call.resolve(ret);
                    return;
                }
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "DakaWorklog");
                if (!dir.exists()) dir.mkdirs();
                File file = new File(dir, filename);
                try (FileOutputStream fos = new FileOutputStream(file)) {
                    fos.write(bytes);
                    fos.flush();
                }
                // 广播刷新相册
                context.sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(file)));
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", file.getAbsolutePath());
                call.resolve(ret);
                return;
            }
        } catch (Exception e) {
            call.reject("保存至相册失败: " + e.getMessage());
            return;
        }

        call.reject("未能创建相册存储条目");
    }

    /**
     * 保存文件并调用系统原生分享/打开面板
     */
    @PluginMethod
    public void saveAndShareFile(PluginCall call) {
        String content = call.getString("content");
        String filename = call.getString("filename", "daka-export-" + System.currentTimeMillis() + ".csv");
        filename = new File(filename).getName();
        String mimeType = call.getString("mimeType", "text/csv");

        if (content == null) {
            call.reject("缺少文件内容");
            return;
        }

        try {
            Context context = getContext();
            File cacheDir = context.getExternalCacheDir();
            if (cacheDir == null) cacheDir = context.getCacheDir();

            File exportDir = new File(cacheDir, "exports");
            if (!exportDir.exists()) exportDir.mkdirs();

            File targetFile = new File(exportDir, filename);
            try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
                fos.flush();
            }

            Uri fileUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", targetFile);

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, fileUri);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, "导出或分享文件");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", targetFile.getAbsolutePath());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("导出或分享失败: " + e.getMessage());
        }
    }
}
