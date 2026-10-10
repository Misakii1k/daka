// 自动化验证与真机视口渲染截图脚本
// 严格规范：严禁使用任何 emoji

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\87850\\.gemini\\antigravity\\brain\\2ca88a1c-c27b-4249-a376-5ea21694c385';

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

  connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = reject;
      this.ws.onmessage = msg => {
        const res = JSON.parse(msg.data);
        if (res.id && this.callbacks.has(res.id)) {
          const { resolve, reject } = this.callbacks.get(res.id);
          this.callbacks.delete(res.id);
          if (res.error) reject(new Error(JSON.stringify(res.error)));
          else resolve(res.result);
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

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res && res.result ? res.result.value : null;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    console.log('截图已保存: ' + outputPath);
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--window-size=412,915',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        const list = await fetchJson('http://127.0.0.1:9226/json');
        const pageTarget = list && list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }

    if (!wsUrl) throw new Error('未能连接到 Chrome 调试端口 9226');

    const client = new CDPClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    // 1. 测试首页布局、加大“已工作”与顶部更新提醒避让
    console.log('1. 测试首页布局与顶部更新浮窗...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=update-float' });
    await sleep(1500);
    await client.captureScreenshot(path.join(ARTIFACT_DIR, '01_today_layout_and_banner.png'));

    // 2. 测试更新弹窗与下方 3 个饱满按钮
    console.log('2. 测试更新弹窗与按钮控件...');
    await client.eval(`
      (() => {
        const btn = document.getElementById('huf-action-btn');
        if (btn) btn.click();
      })()
    `);
    await sleep(600);
    await client.captureScreenshot(path.join(ARTIFACT_DIR, '02_update_modal_buttons.png'));

    // 3. 关闭更新弹窗，切换到设置/统计页面，测试主题分段滑块与鲜艳薪资
    console.log('3. 测试统计页面、鲜艳薪资与主题分段滑块(浅色)...');
    await client.eval(`
      (() => {
        const cancelBtn = document.getElementById('btn-cancel-update');
        if (cancelBtn) cancelBtn.click();
        const tabStats = document.querySelector('button[data-go="stats"]');
        if (tabStats) tabStats.click();
      })()
    `);
    await sleep(600);
    // 切换到浅色模式
    await client.eval(`
      (() => {
        const lightBtn = document.querySelector('#theme-seg-tabs .m3-seg-tab[data-theme="light"]');
        if (lightBtn) lightBtn.click();
      })()
    `);
    await sleep(500);
    await client.captureScreenshot(path.join(ARTIFACT_DIR, '03_theme_light_and_vivid_salary.png'));

    // 4. 测试主题分段滑块切换到深色模式
    console.log('4. 测试深色模式下主题滑块覆盖与艳丽金额...');
    await client.eval(`
      (() => {
        const darkBtn = document.querySelector('#theme-seg-tabs .m3-seg-tab[data-theme="dark"]');
        if (darkBtn) darkBtn.click();
      })()
    `);
    await sleep(500);
    await client.captureScreenshot(path.join(ARTIFACT_DIR, '04_theme_dark_and_salary.png'));

    // 5. 切换到 Cloudflare 极简存储面板
    console.log('5. 测试全新 Cloudflare D1 极简存储面板...');
    // 换回浅色模式展示
    await client.eval(`
      (() => {
        const lightBtn = document.querySelector('#theme-seg-tabs .m3-seg-tab[data-theme="light"]');
        if (lightBtn) lightBtn.click();
        const cfTab = document.querySelector('.storage-tab[data-storage="cloudflare"]');
        if (cfTab) {
          cfTab.click();
          const p = document.getElementById('storage-panel-cloudflare');
          if (p) p.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      })()
    `);
    await sleep(600);
    await client.captureScreenshot(path.join(ARTIFACT_DIR, '05_cloudflare_simplified_panel.png'));

    // 6. 测试导出结算单页面排版布局（浅色模式）
    console.log('6. 测试导出结算单页面排版布局(浅色模式)...');
    await client.eval(`
      (() => {
        if (typeof openExportModal === 'function') {
          openExportModal();
        } else {
          const btn = document.getElementById('btn-open-export');
          if (btn) btn.click();
        }
      })()
    `);
    await sleep(600);
    await client.captureScreenshot(path.join(ARTIFACT_DIR, '06_export_modal_light.png'));

    // 7. 测试导出结算单页面排版布局（深色模式）
    console.log('7. 测试导出结算单页面排版布局(深色模式)...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=receipt-modal-dark' });
    await sleep(1500);
    await client.captureScreenshot(path.join(ARTIFACT_DIR, '07_export_modal_dark.png'));

    console.log('所有验证截图生成完毕！');
    client.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
  }
}

run().catch(err => {
  console.error('测试出错:', err);
  process.exit(1);
});
