<p align="center">
  <img src="./assets/readme/hero.png" width="100%" alt="工时打卡：一天就是一条时间带，本地优先的工时与薪资对账系统">
</p>

<p align="center">
  <a href="https://github.com/Misakii1k/daka/releases"><img src="https://img.shields.io/github/v/release/Misakii1k/daka?color=ff5b2e&label=%E7%89%88%E6%9C%AC" alt="版本"></a>
  <a href="#本地运行"><img src="https://img.shields.io/badge/%E6%9E%B6%E6%9E%84-Local--First-10b981" alt="Local First"></a>
  <a href="#android"><img src="https://img.shields.io/badge/Android%20APK-5MB%20%E5%86%85-2563eb" alt="APK 大小"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF-MIT-64748b" alt="MIT"></a>
</p>

兼职、灵活就业、工程外包、多工时项目制——这类工作的考勤软件通常不需要组织架构、审批流和强制社交，只需要**把这一天的工时记准确，把这个月的钱算清楚**。

**工时打卡**就是按这个前提做的。记录默认只存在本地设备，可以 PWA 离网运行，也可以打包成原生 Android 应用。对账结果按热敏凭单排版导出，也能直接存进手机相册。

---

## 三个决定性的设计

### 一天就是一条时间带

不用表格，也不用统计图。全天工时画在一条 0–24 点的横向轨道上，橙色段是实际工作时间，午休从中间扣掉。缺卡的地方在轨道上是空的——一眼就能看出来那天漏了什么。

### 打卡不该有仪式感

设置页可以预设默认上下班时间，长按打卡直接按该作息记录，不用每天先打一次再回头微调。单手几秒完成，然后退出。

### 对账结果要能直接交给对方

- **热敏凭单排版**：内置多套经典对账版式，一键生成长图。
- **Android 相册原生写入**：通过定制 `FileExportPlugin` 走 `MediaStore` 真实保存到系统相册，图库里立刻可见。
- **CSV / Excel 导出**：UTF-8 BOM 编码，自动防护 CSV 公式注入，支持系统原生分享面板。

---

## 还有什么

- **智能薪资与大写金额**：输入时薪与标准日工时，自动核算应发总额、出勤天数与缺勤缺卡工时，并生成符合财务记账规范的汉字大写金额（如「柒佰柒拾柒元整」）。
- **零 Emoji 工业风**：全部页面与通知禁用彩色表情符号，文案精炼，呈经典收据凭单的严谨观感。
- **按需加载**：手写识别、神经网络权重与庆祝动效都不阻塞首屏。
- **键盘可访问**：弹窗支持 Escape 关闭与焦点陷阱，底部导航支持方向键切换。
- **体积克制**：Android Debug 安装包严格控制在 4–5MB，无账号追踪，无后台常驻。

---

## 本地运行

```bash
git clone https://github.com/Misakii1k/daka.git
cd daka
npm ci
npm run build:web   # 生成运行时静态目录 www/
npm run dev         # 起本地静态服务
```

浏览器访问 `http://localhost:5173` 即可使用。

### 规范门禁

这个项目有几道自动化检查，改动后建议都跑一遍：

```bash
npm test              # 单元测试 + 薪资/导出回归
npm run check:emoji   # 全局扫描，确保 100% 零 Emoji
npm run check:refs    # 校验 Haptic / 导出器 / DOM id 引用一致
npm run check:versions # 版本号、缓存名、Gradle 与 APK 哈希一致
```

### Android

采用 Capacitor 封装，需要 JDK 21 与 Android SDK。

```bash
npm run build:apk
```

产物在 `android/app/build/outputs/apk/debug/app-debug.apk`。发布前归档到 `release/daka-<version>-android.apk` 与 `release/daka-latest.apk`。

> 请保持 APK 稳定在 4–5MB 区间，并且不要在 Web 目录放二进制产物，否则会资源递归嵌套。

### 部署到 Cloudflare Pages

```bash
npm run build:site    # 生成只含运行时文件、Functions、安全头与安装包的 .deploy/
npx wrangler pages deploy .deploy --project-name daka
```

`.deploy/` 由 `scripts/build-site.mjs` 生成，只包含运行时静态文件、`_headers`、`_routes.json` 与安装包。构建脚本会自动排除 `design/`、`android/`、`verify_*.js`、`tmp_artifacts/`，并校验 APK 哈希与单文件 25MiB 上限。

#### 云端同步（可选，默认关闭）

1. 在 Cloudflare D1 建库，并在 Pages 项目中绑定为 `DB`。
2. 执行 `schema.sql`；已有旧库执行 `migrations/0002_add_deleted_at.sql`。
3. 设置环境变量 `SYNC_ENABLED=1`，按需设置 `ALLOWED_ORIGINS`。
4. 在 App 的「数据存储与同步」中开启，首次开启会生成 32 位同步码，其他设备粘贴同一同步码即可合并。

同步码是唯一凭证，服务端只保存其 SHA-256 派生 ID，不保存原文；更换同步码后旧数据不会自动迁移。
`/api/webdav`、`/api/export`、`/api/notify` 默认返回 404，只有显式设置对应 `*_ENABLED=1` 且配置密钥后才启用。

### 版本发布

```bash
npm run version:bump                        # 同步各处版本号
npm run build:web && npm run build:apk      # 构建
npm run version:bump -- --version 1.0.10    # 回填 apkSha256
npm run build:web && npm run build:site     # 带上哈希重新生成
```

`build-site.mjs` 会校验 `version.json.apkSha256` 与 `release/` 中的 APK 一致，不一致直接构建失败——避免发布未校验的安装包。

---

## 设计令牌

约定见 [design/DESIGN.md](./design/DESIGN.md)：

| Token | 颜色 | 用途 |
| :--- | :--- | :--- |
| `--ink` | `#141414` | 主文字、大数字、主按钮底色、「现在」游标 |
| `--accent` | `#FF5B2E` | 工作时段高光条、缺卡提醒、导航指示点 |
| `--track` | `#F1F1F1` | 0–24h 时间带轨道、已完成按钮底色 |
| `--mute` | `#777777` | 日期标签、单位后缀、次要提示 |
| `--line` | `#EEEEEE` | 分割线与区块边框 |
| `--bg` | `#FFFFFF` | 页面基础底色 |

---

## 贡献

本项目基于 [MIT License](./LICENSE) 开源。欢迎提交 Issue 或 Pull Request。
