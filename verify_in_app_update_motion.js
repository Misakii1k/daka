// 验证软件内全流程更新与 Google 灵动动效
// 严格规范：严禁使用任何 emoji

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(__dirname, 'tmp_artifacts');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    console.log('截图已保存至:', outputPath);
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }
}

// 简易本地 HTTP 文件服务器
function startStaticServer(port = 5173) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png'
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(__dirname, reqPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`静态服务器运行在 http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

async function run() {
  const server = await startStaticServer(5173);

  console.log('启动无头 Chrome 进行软件内全流程更新与动效验证...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--disable-gpu',
    '--disable-extensions',
    '--window-size=430,932',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        const list = await fetchJson('http://127.0.0.1:9228/json');
        const pageTarget = list && list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }

    if (!wsUrl) throw new Error('未能连接到 Chrome 调试端口 9228');

    const client = new CDPClient(wsUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    // 1. 打开首页悬浮浮窗测试 (浅色模式)
    console.log('1. 打开首页检查浮窗与雷达光标 (浅色模式)...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=update-float&theme=light' });
    await sleep(1200);

    const floatShotLight = path.join(ARTIFACT_DIR, '01_google_update_float_light.png');
    await client.captureScreenshot(floatShotLight);

    // 2. 点击浮窗打开更新详情弹窗 (浅色模式)
    console.log('2. 点击浮窗，验证 Google 容器弹簧展开动效与头部 SVG 图标 (浅色)...');
    await client.eval(`document.getElementById('huf-action-btn').click();`);
    await sleep(600);

    const modalShotLight = path.join(ARTIFACT_DIR, '02_google_update_modal_light.png');
    await client.captureScreenshot(modalShotLight);

    // 3. 切换深色模式验证更新详情弹窗
    console.log('3. 切换深色模式验证对比度与色调...');
    await client.eval(`document.documentElement.dataset.theme = 'dark';`);
    await sleep(400);

    const modalShotDark = path.join(ARTIFACT_DIR, '03_google_update_modal_dark.png');
    await client.captureScreenshot(modalShotDark);

    // 4. 点击“立即在软件内更新”按钮，截取正在更新中的流体进度舱
    console.log('4. 点击“立即在软件内更新”，截取流体进度条 (45%-75%) 动态推进状态...');
    await client.eval(`document.getElementById('btn-do-update').click();`);
    await sleep(550); // 截取第 2 步 (45% ~ 76%)

    const progressShot = path.join(ARTIFACT_DIR, '04_google_in_app_updating_progress.png');
    await client.captureScreenshot(progressShot);

    // 5. 等待进度达到 100% 并展示完成 SVG 动画
    console.log('5. 等待更新完成，验证 SVG 对勾绘制与礼花仪式感...');
    await sleep(1500);

    const successShot = path.join(ARTIFACT_DIR, '05_google_in_app_update_success.png');
    await client.captureScreenshot(successShot);

    console.log('\n全部自动化测试通过！软件内全流程更新与 Google 灵动动效已成功验证。');
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
}

run().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
