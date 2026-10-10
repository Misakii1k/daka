# 工时打卡 (Daka Worklog)

<p align="center">
  <img src="./assets/readme/hero.svg" alt="工时打卡系统 Daka Worklog Banner" width="100%">
</p>

<p align="center">
  <a href="#核心特性"><img src="https://img.shields.io/badge/设计规范-100%25%20零%20Emoji-ff5b2e?style=flat-square" alt="Zero Emoji"></a>
  <a href="#架构设计"><img src="https://img.shields.io/badge/架构-Local--First%20本地优先-10b981?style=flat-square" alt="Local First"></a>
  <a href="#移动端支持"><img src="https://img.shields.io/badge/Android%20APK-%3C%205MB-2563eb?style=flat-square" alt="APK Size"></a>
  <a href="#云端部署"><img src="https://img.shields.io/badge/部署-Cloudflare%20Pages-f59e0b?style=flat-square" alt="Cloudflare Pages"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/开源协议-MIT-64748b?style=flat-square" alt="License MIT"></a>
</p>

---

## 项目简介

**工时打卡 (Daka Worklog)** 是一款专为兼职、灵活就业、工程外包与多工时项目制人员打造的**极简、高保真、本地优先 (Local-First)** 工时考勤与薪资对账结算系统。

区别于传统企业考勤软件的繁琐定位、强制社交和臃肿权限，工时打卡始终贯彻**“单手操作、几秒完成、纯粹无扰”**的产品哲学。所有打卡记录默认存储于本地设备，支持 PWA 离网运行与原生 Android 混合打包，并提供热敏小票式凭单排版、相册原生保存以及标准财务级对账单导出。

---

## 核心特性

- **时间带可视化 (“一天就是一条时间带”)**
  摒弃生硬的表格和复杂统计图，以一条直观的 0–24 点横向时间轨呈现全天工时。橙色时段标记实际工作时间，支持午休时长精准剔除，直观掌握工时跨度与缺卡状态。
- **全端严守 100% 零 Emoji 工业风**
  全系统所有页面与通知严禁使用任何彩色表情符号，文案精炼干脆，采用经典收据凭单排版风格，呈现严谨、专业的财务级对账视觉。
- **多版式核算导出与原生保存**
  - **热敏小票 / 凭单排版**：内置多套经典对账版式，一键生成对账长图。
  - **Android 相册原生写入**：通过定制 `FileExportPlugin`，支持利用 Android `MediaStore` 真实保存长图至系统相册，并在图库即时可见。
  - **标准 CSV / Excel 表格**：内置 UTF-8 BOM 编码导出与 Cloudflare Functions 流式响应，防止乱码，支持系统原生分享面板。
- **智能薪资与大写金额引擎**
  输入时薪与标准日工时，自动核算应发总额、出勤天数与缺勤缺卡工时，并自动生成符合财务记账规范的汉字大写金额（如“柒佰柒拾柒元整”）。
- **极度克制与安全隐私**
  无账号追踪、无多余后台常驻。标准 Android Debug 安装包体积严格控制在 **4MB ~ 5MB**，极速响应，不占内存。

---

## 架构设计

<p align="center">
  <img src="./assets/readme/architecture.svg" alt="工时打卡系统架构图" width="100%">
</p>

1. **终端与呈现层**：基于原生纯粹 Web 技术构建，搭配 Service Worker 离线缓存策略；结合 Capacitor 混合技术封装为轻量 Android 原生 App。
2. **核心逻辑层**：
   - 0–24 小时时间带线性映射引擎
   - 薪资与工时智能计算器（内置大写金额转换）
   - 轻量前向手写神经网络（用于手写补卡识别）
   - 本地持久化层（IndexedDB 与 LocalStorage 双重校验）
3. **原生能力与云端支持**：
   - **Android 原生层**：原生 Java 插件，桥接 `MediaStore`、`FileProvider` 与 Android 系统分享面板。
   - **服务端支持**：Cloudflare Pages 静态边缘托管 + Cloudflare Functions (`/api/export`) 无服务器流式导出。

---

## 快速上手

### 1. 本地网页运行

```bash
# 克隆仓库
git clone https://github.com/your-username/daka-worklog.git
cd daka-worklog

# 启动本地静态服务
npm run dev
# 或直接使用任意本地静态服务器打开 index.html
```
浏览器访问 `http://localhost:5173` 即可开始使用。

### 2. 自动化测试与代码规范检查

本项目拥有严格的代码与界面规范门禁：

```bash
# 验证薪资核算引擎、大写金额转换与 CSV 表格导出格式
npm test

# 全局扫描代码与界面，确保 100% 绝对零 Emoji 违规
npm run check:emoji
```

### 3. Android 原生应用构建

本项目采用 Capacitor 进行 Android 容器封装，构建要求：JDK 21 与 Android SDK。

```bash
# 1. 同步 Web 静态资源至 Android 工程
npx cap sync android

# 2. 编译并输出 Debug APK
cd android
./gradlew assembleDebug

# 构建产物位于：android/app/build/outputs/apk/debug/app-debug.apk
```

> **构建规范提醒**：请确保 APK 安装包体积稳定在 4MB ~ 5MB 区间。严禁在 Web 目录放置二进制产物，避免资源递归嵌套。

### 4. Cloudflare Pages 部署

本项目支持一键部署到 Cloudflare Pages：

```bash
# 部署至 Cloudflare Pages 静态与无服务器函数
npx wrangler pages deploy . --project-name daka
```

---

## 核心设计规范 (DESIGN TOKENS)

依照项目 [design/DESIGN.md](./design/DESIGN.md) 约定：

| Token | 颜色值 | 界面语义与用途 |
| :--- | :--- | :--- |
| `--ink` | `#141414` | 主文字、大数字展示、主按钮底色、「现在」游标竖线 |
| `--accent` | `#FF5B2E` | 工作时段高光条、缺卡提醒、当前导航标签指示点 |
| `--track` | `#F1F1F1` | 0-24h 时间带轨道底色、已完成按钮底色 |
| `--mute` | `#777777` | 日期标签、单位后缀、次要提示文字 |
| `--line` | `#EEEEEE` | 分割线与区块分隔边框 |
| `--bg` | `#FFFFFF` | 页面基础底色 |

---

## 开源协议

本项目基于 [MIT License](./LICENSE) 协议开源。欢迎提交 Issue 或 Pull Request 共同改进！
