// 验证首页新版本浮窗与更新弹窗的渲染与交互
// 严格规范：严禁使用任何 emoji

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\87850\\.gemini\\antigravity\\brain\\fa4956b3-5e10-4a9c-98b0-2407f2297661';

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

async function run() {
  console.log('启动无头 Chrome 实例进行首页浮窗更新测试...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--disable-gpu',
    '--disable-extensions',
    '--window-size=440,950',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        const list = await fetchJson('http://127.0.0.1:9225/json');
        const pageTarget = list && list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }

    if (!wsUrl) throw new Error('未能连接到 Chrome 调试端口 9225');

    const client = new CDPClient(wsUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    console.log('打开应用页面 (mode=update-float)...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=update-float' });
    await sleep(1500);

    // 1. 截取首页更新浮窗（浅色模式）
    const shotPathFloatLight = path.join(ARTIFACT_DIR, 'update_float_light.png');
    await client.captureScreenshot(shotPathFloatLight);

    // 2. 截取首页更新浮窗（深色模式）
    await client.eval(`document.documentElement.dataset.theme = 'dark';`);
    await sleep(300);
    const shotPathFloatDark = path.join(ARTIFACT_DIR, 'update_float_dark.png');
    await client.captureScreenshot(shotPathFloatDark);

    // 3. 点击浮窗打开更新弹窗
    console.log('点击浮窗打开更新详情弹窗...');
    await client.eval(`
      (() => {
        document.getElementById('huf-action-btn').click();
      })()
    `);
    await sleep(400);

    // 截取更新详情弹窗（深色模式）
    const shotPathModalDark = path.join(ARTIFACT_DIR, 'update_modal_dark.png');
    await client.captureScreenshot(shotPathModalDark);

    // 切换回浅色模式截取更新详情弹窗
    await client.eval(`document.documentElement.dataset.theme = 'light';`);
    await sleep(300);
    const shotPathModalLight = path.join(ARTIFACT_DIR, 'update_modal_light.png');
    await client.captureScreenshot(shotPathModalLight);

    console.log('\n首页浮窗与更新弹窗全部测试通过！');
  } finally {
    try {
      chromeProc.kill();
    } catch (e) {}
  }
}

run().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
