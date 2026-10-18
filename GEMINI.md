# 工时打卡项目规范 (Project Rules)

## 1. 语言与命名规范
- 对话交互、提交信息与技术文档均使用**简体中文**。

## 2. Capacitor 混合移动端构建规范
- **`www/` 是生成目录**：`webDir` 为 `www`，由 `npm run build:web`（`scripts/build-web.mjs`）从根目录运行时文件生成；禁止手工复制，禁止在 `www/` 目录下存放 `.apk`、`.aab` 或其他非 Web 静态资源。否则执行 `npx cap sync` 时会将旧包递归拷入 `android/app/src/main/assets/public/`，导致新 APK 嵌套旧包并引起体积几何级膨胀。
- **发布产物专用目录**：所有构建好的安装包统一且仅存放在工程根目录的 `release/` 下，并在 `version.json` 中登记 `apkSha256`。
- **清理与重构保障**：在修改、精简 assets 或出现 APK 体积异常时，必须执行 `cd android && ./gradlew clean assembleDebug`，避免 Gradle 增量合并缓存残留旧资源。
- **健康体积基线**：本项目标准 Debug APK 体积应稳定在 **4MB ~ 5MB** 区间，超过 10MB 即需告警排查 assets 目录。

## 3. Cloudflare Pages 静态部署约束
- **只部署 `.deploy/`**：先执行 `npm run build:site` 生成 `.deploy/`，再执行 `npx wrangler pages deploy .deploy --project-name daka`。严禁直接部署仓库根目录，否则 `design/`、`android/`、`verify_*.js`、`tmp_artifacts/` 等文件会进入公开站点。
- **单文件 25 MiB 上限**：`build-site.mjs` 会校验单文件体积与文件数；超过上限时构建失败。
- **本地代理环境变量**：在配置了本地 HTTP 代理（如 `127.0.0.1:7897`）的环境下，运行 `wrangler` 部署命令前需显式挂载代理变量：
  `cmd /c "set HTTP_PROXY=http://127.0.0.1:7897 && set HTTPS_PROXY=http://127.0.0.1:7897 && npx wrangler pages deploy .deploy --project-name daka"`。

## 4. 数据操作与 UI 状态联动规范
- **统一写入口**：记录的新增/修改必须调用 `upsertRecord(key, patch)`，删除必须调用 `removeRecord(key)`；禁止直接 `log[key] = ...` 或 `delete log[key]`。写入口会自动维护 `updatedAt` 与删除墓碑。
- **即时响应**：调用 `saveLog()` 完成持久化后，必须立即执行 `renderAll()`，保障今天、记录、统计三个视图即时同步，严禁依赖页面手动刷新。
- **同步默认关闭**：`settings.syncEnabled` 默认 `false`；任何自动同步都必须在显式开启后才允许发起。禁止在启动时自动生成同步码或上传数据。
- **凭据不入备份**：导出 JSON、WebDAV 备份与云端载荷必须经过 `sanitizeSettingsForExport()`，不得包含 `webdav.pass`、`cloudUserId`、`syncToken`。

## 5. 任务交付与自动推送部署闭环（严禁漏推）
- **严禁停留在本地等待用户催促**：每次完成用户提出的功能开发、UI 优化或 Bug 修复后，**必须在当前回合内一站式完成从版本递增、移动端打包、Git 提交推送至 Cloudflare 线上部署的完整闭环**，绝不允许停留在本地等待用户告知“推送下”。
- **版本号单一来源**：`version.json` 是唯一版本源，必须使用 `npm run version:bump` 递增，禁止手工改多处。脚本会同步：
  - `package.json` 中的 `version`
  - `app.js` 中的 `APP_VERSION`
  - `version.json` 中的 `version`, `versionCode`, `buildTime`, `releaseNotes`, `apkUrl`, `downloadUrl`, `apkSha256`
  - `sw.js` 中的 `CACHE` 标识
  - `android/app/build.gradle` 中的 `versionCode` 和 `versionName`
  - `index.html` 中的当前版本展示
- **`www/` 与 `functions/version.json.ts`**：`www/` 由 `npm run build:web` 生成；`functions/version.json.ts` 已废弃，版本统一由静态 `version.json` + `_headers` 提供。
- **全自动化发布执行流**：
  1. 执行 `npm run version:bump`（如 APK 尚未生成，`apkSha256` 会留空）；
  2. 执行 `npm run build:web` 生成 `www/`；
  3. 执行 `npm run build:apk` 构建 APK，归档至 `release/daka-<version>-android.apk` 与 `release/daka-latest.apk`；
  4. 构建 APK 后再次执行 `npm run version:bump -- --version 1.0.10`（替换为当前版本）写入 `apkSha256`；
  5. 再次执行 `npm run build:web`，确保 `www/version.json` 也带上最新哈希；
  6. 执行 `npm run check:emoji && npm run check:refs && npm run check:versions && npm test`；
  7. 执行 `npm run build:site` 生成 `.deploy/`；
  8. 执行 `git add .`、`git commit` 与 `git push origin main`；
  9. 挂载代理执行 `wrangler pages deploy .deploy --project-name daka` 部署到 Cloudflare Pages；
  10. 验证各端无误后直接交付。
