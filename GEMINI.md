# 工时打卡项目规范 (Project Rules)

## 1. 语言与命名规范
- 对话交互、提交信息与技术文档均使用**简体中文**。

## 2. Capacitor 混合移动端构建规范
- **禁止在 Web 目录放置二进制产物**：Capacitor 的 `webDir` 为 `www`，严禁在 `www/` 目录下存放 `.apk`、`.aab` 或其他非 Web 静态资源。否则执行 `npx cap sync` 时会将旧包递归拷入 `android/app/src/main/assets/public/`，导致新 APK 嵌套旧包并引起体积几何级膨胀。
- **发布产物专用目录**：所有构建好的安装包统一且仅存放在工程根目录的 `release/` 下。
- **清理与重构保障**：在修改、精简 assets 或出现 APK 体积异常时，必须执行 `cd android && ./gradlew clean assembleDebug`，避免 Gradle 增量合并缓存残留旧资源。
- **健康体积基线**：本项目标准 Debug APK 体积应稳定在 **4MB ~ 5MB** 区间，超过 10MB 即需告警排查 assets 目录。

## 3. Cloudflare Pages 静态部署约束
- **单文件 25 MiB 上限**：Cloudflare Pages 针对单个上传的静态文件有严格的 25 MiB 体积硬限制。在执行 `wrangler pages deploy` 前，必须检查待上传目录下所有文件体积。
- **本地代理环境变量**：在配置了本地 HTTP 代理（如 `127.0.0.1:7897`）的环境下，运行 `wrangler` 部署命令前需显式挂载代理变量：
  `cmd /c "set HTTP_PROXY=http://127.0.0.1:7897 && set HTTPS_PROXY=http://127.0.0.1:7897 && npx wrangler pages deploy . --project-name daka"`。

## 4. 数据操作与 UI 状态联动规范
- **打卡记录即时响应**：在 `app.js` 中调用 `saveRecord()` 完成数据写入并更新存储后，必须立即触发日历组件重新渲染（`renderCalendar()`）和看板统计刷新，保障用户界面视图即时同步，严禁依赖页面手动刷新。
