// 五套工时结算版式（收银小票、复古工卡、现代报表、日历热力、记账便签）全链路验证与高清截图脚本
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

  async captureScreenshot(outputPath, clip = null) {
    const params = { format: 'png' };
    if (clip) params.clip = clip;
    const res = await this.send('Page.captureScreenshot', params);
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
  console.log('启动无头 Chrome 实例进行五大版式全量验收...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9224',
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
        const list = await fetchJson('http://127.0.0.1:9224/json');
        const pageTarget = list && list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }

    if (!wsUrl) throw new Error('未能连接到 Chrome 调试端口 9224');

    const client = new CDPClient(wsUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });

    console.log('打开应用页面并预置出勤测试数据...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=receipt-modal' });
    await sleep(1500);

    // 预置一段真实的当月出勤测试数据
    await client.eval(`
      (() => {
        const testLog = {};
        const y = 2026, m = 10;
        const pad = n => String(n).padStart(2, '0');
        for (let d = 1; d <= 25; d++) {
          const dateKey = \`\${y}-\${pad(m)}-\${pad(d)}\`;
          const dayOfWeek = new Date(y, m - 1, d).getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // 工作日
            if (d === 15) {
              testLog[dateKey] = { in: '09:00', out: '20:30', lunch: 60, note: '项目攻坚' };
            } else if (d === 20) {
              testLog[dateKey] = { in: '08:30', out: '', lunch: 60 }; // 缺卡
            } else {
              testLog[dateKey] = { in: '08:30', out: '18:00', lunch: 60 };
            }
          }
        }
        localStorage.setItem('worklog', JSON.stringify(testLog));
        const s = JSON.parse(localStorage.getItem('worklog-settings') || '{}');
        s.wage = 35;
        s.userName = '李师傅';
        localStorage.setItem('worklog-settings', JSON.stringify(s));
      })()
    `);

    console.log('重新导航至带参数页面...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/?mode=receipt-modal' });
    await sleep(1500);

    // 检查元素是否存在
    const diag = await client.eval(`
      (() => {
        return {
          href: location.href,
          title: document.title,
          bodySnippet: document.body?.innerHTML?.slice(0, 300),
          hasModal: !!document.getElementById('export-modal'),
          hasSelect: !!document.getElementById('em-theme-select'),
          hasPaper: !!document.getElementById('receipt-paper'),
          modalHidden: document.getElementById('export-modal')?.hidden
        };
      })()
    `);
    console.log('页面诊断状态:', diag);

    // 确保导出弹窗已开启并已初始化
    await client.eval(`
      (() => {
        const modal = document.getElementById('export-modal');
        if (modal) modal.hidden = false;
        const nameInp = document.getElementById('em-name-input');
        if (nameInp) nameInp.value = '李师傅';
        const wageInp = document.getElementById('em-wage-input');
        if (wageInp) wageInp.value = 35;
      })()
    `);
    await sleep(500);

    const themes = [
      { id: 'receipt', name: '热敏收银小票' },
      { id: 'timecard', name: '复古打卡工卡' },
      { id: 'statement', name: '现代极简报表' },
      { id: 'calendar', name: '日历热力手账' },
      { id: 'memo', name: '胶带记账便签' }
    ];

    // 1. 浅色模式下逐一测试并截图预览
    console.log('\n--- 浅色模式五大版式预览验证 ---');
    for (const theme of themes) {
      console.log(`切换版式为: ${theme.name} (${theme.id})`);
      await client.eval(`
        (() => {
          const sel = document.getElementById('em-theme-select');
          sel.value = '${theme.id}';
          sel.dispatchEvent(new Event('change'));
        })()
      `);
      await sleep(400);

      const shotPath = path.join(ARTIFACT_DIR, `preview_${theme.id}_light.png`);
      await client.captureScreenshot(shotPath);

      // 同时验证 Canvas 渲染生成能力
      console.log(`验证 ${theme.name} Canvas 生成...`);
      const canvasResult = await client.eval(`
        (() => {
          const report = window.SalaryExporter.computeMonthReportData(new Date(2026, 9, 1), JSON.parse(localStorage.getItem('worklog') || '{}'), JSON.parse(localStorage.getItem('worklog-settings') || '{}'), 35, '李师傅');
          const canvas = window.SalaryExporter.ThemeRegistry['${theme.id}'].renderCanvas(report);
          return {
            width: canvas.width,
            height: canvas.height,
            dataUrl: canvas.toDataURL('image/png')
          };
        })()
      `);

      console.log(`  Canvas 规格: 宽 ${canvasResult.width}px, 高 ${canvasResult.height}px`);
      const base64Data = canvasResult.dataUrl.replace(/^data:image\/png;base64,/, '');
      const canvasShotPath = path.join(ARTIFACT_DIR, `export_canvas_${theme.id}.png`);
      fs.writeFileSync(canvasShotPath, Buffer.from(base64Data, 'base64'));
      console.log(`  Canvas 高清长图已保存: ${canvasShotPath}`);
    }

    // 2. 深色模式下逐一测试并截图预览
    console.log('\n--- 深色模式五大版式预览验证 ---');
    await client.eval(`
      (() => {
        document.documentElement.dataset.theme = 'dark';
      })()
    `);
    await sleep(300);

    for (const theme of themes) {
      console.log(`深色模式切换版式为: ${theme.name} (${theme.id})`);
      await client.eval(`
        (() => {
          const sel = document.getElementById('em-theme-select');
          sel.value = '${theme.id}';
          sel.dispatchEvent(new Event('change'));
        })()
      `);
      await sleep(300);

      const shotPath = path.join(ARTIFACT_DIR, `preview_${theme.id}_dark.png`);
      await client.captureScreenshot(shotPath);
    }

    console.log('\n五套版式（收银小票、复古工卡、现代报表、日历热力、记账便签）全量验证通过！');

  } finally {
    try {
      chromeProc.kill();
    } catch (e) {}
  }
}

run().catch(err => {
  console.error('测试异常失败:', err);
  process.exit(1);
});
