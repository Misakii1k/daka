// 端到端测试与截图脚本：验证 handwriting_lab.html 中的方案 A 与方案 B
// 严格遵守规范：严禁使用任何 emoji

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

async function run() {
  console.log('启动无头 Chrome 实例...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--disable-gpu',
    '--window-size=440,950',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        const list = await fetchJson('http://127.0.0.1:9223/json');
        if (list && list.length > 0 && list[0].webSocketDebuggerUrl) {
          wsUrl = list[0].webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }

    if (!wsUrl) throw new Error('未能连接到 Chrome 调试端口 9223');

    console.log('CDP 连接已建立:', wsUrl);
    const client = new CDPClient(wsUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    console.log('导航到实验室页面: http://127.0.0.1:5173/handwriting_lab.html');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/handwriting_lab.html' });
    await sleep(1000);

    // 1. 截取方案 A 初始状态
    const shotPathAInit = path.join(ARTIFACT_DIR, 'lab_scheme_a_initial.png');
    await client.captureScreenshot(shotPathAInit);

    // 2. 模拟方案 A 分格写入 18:26
    console.log('模拟方案 A 分格写入 1, 8, 2, 6...');
    await client.eval(`
      (() => {
        // 构造数字笔画
        function makeLine(x0, y0, x1, y1, steps = 15) {
          const pts = [];
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            pts.push({ x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0) });
          }
          return pts;
        }
        function makeArc(cx, cy, rx, ry, startAngle, endAngle, steps = 25) {
          const pts = [];
          for (let i = 0; i <= steps; i++) {
            const a = startAngle + (i / steps) * (endAngle - startAngle);
            pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
          }
          return pts;
        }

        const stroke1 = [makeLine(150, 40, 150, 180, 25)];
        const stroke8 = [(() => {
          const pts = [];
          for (let i = 0; i <= 50; i++) {
            const t = (i / 50) * Math.PI * 2;
            pts.push({ x: 150 + 40 * Math.sin(t), y: 110 + 70 * Math.sin(t) * Math.cos(t) * 1.8 });
          }
          return pts;
        })()];
        const stroke2 = [[
          ...makeArc(150, 70, 45, 45, Math.PI, 0, 20),
          ...makeLine(195, 70, 105, 180, 25),
          ...makeLine(105, 180, 200, 180, 25)
        ]];
        const stroke6 = [[
          ...makeLine(180, 40, 120, 130, 20),
          ...makeArc(155, 140, 40, 40, Math.PI * 0.5, Math.PI * 2.5, 30)
        ]];

        // 写入当前激活格
        function enterDigit(digitIdx, strokeData) {
          currentActiveCell = digitIdx;
          updateCellUI();
          padA.strokes = strokeData;
          padA.redraw();
          const box = getBBox(strokeData);
          const input784 = window.NNEngine.preprocessStrokes(strokeData, box);
          const res = window.NNEngine.predict(input784);
          cellDigits[digitIdx] = res.digit;
          updateCellUI();
        }

        enterDigit(0, stroke1);
        enterDigit(1, stroke8);
        enterDigit(2, stroke2);
        enterDigit(3, stroke6);
        updateCellUI();
        padA.strokes = stroke6;
        padA.redraw();
      })()
    `);
    await sleep(500);

    const valA = await client.eval(`document.getElementById('res-a-val').textContent`);
    console.log('方案 A 当前识别显示值:', valA);
    const shotPathAFilled = path.join(ARTIFACT_DIR, 'lab_scheme_a_filled.png');
    await client.captureScreenshot(shotPathAFilled);

    // 3. 切换到方案 B：自由画板 + 神经网络
    console.log('切换到方案 B...');
    await client.eval(`document.getElementById('tab-b-btn').click();`);
    await sleep(500);

    const shotPathBInit = path.join(ARTIFACT_DIR, 'lab_scheme_b_initial.png');
    await client.captureScreenshot(shotPathBInit);

    // 4. 在方案 B 输入自由连写 18:26
    console.log('在方案 B 输入手写 18:26 并触发神经网络识别...');
    await client.eval(`
      (() => {
        function makeLine(x0, y0, x1, y1, steps = 15) {
          const pts = [];
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            pts.push({ x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0) });
          }
          return pts;
        }
        function makeArc(cx, cy, rx, ry, startAngle, endAngle, steps = 25) {
          const pts = [];
          for (let i = 0; i <= steps; i++) {
            const a = startAngle + (i / steps) * (endAngle - startAngle);
            pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
          }
          return pts;
        }

        const s1 = makeLine(35, 30, 35, 170, 25);
        const s8 = [];
        for (let i = 0; i <= 50; i++) {
          const t = (i / 50) * Math.PI * 2;
          s8.push({ x: 95 + 28 * Math.sin(t), y: 100 + 60 * Math.sin(t) * Math.cos(t) * 1.8 });
        }
        const sColonTop = makeArc(150, 75, 10, 10, 0, Math.PI * 2, 16);
        const sColonBot = makeArc(150, 125, 10, 10, 0, Math.PI * 2, 16);
        const s2 = [
          ...makeArc(200, 65, 26, 26, Math.PI, 0, 20),
          ...makeLine(226, 65, 175, 170, 25),
          ...makeLine(175, 170, 230, 170, 25)
        ];
        const s6 = [
          ...makeLine(275, 35, 245, 115, 20),
          ...makeArc(275, 125, 26, 32, Math.PI * 0.5, Math.PI * 2.5, 30)
        ];

        const allStrokes = [s1, s8, sColonTop, sColonBot, s2, s6];
        padB.strokes = allStrokes;
        padB.redraw();
        padB.onEnd(allStrokes);
      })()
    `);
    await sleep(600);

    const valB = await client.eval(`document.getElementById('res-b-val').textContent`);
    const debugItemsCount = await client.eval(`document.querySelectorAll('.char-debug-item').length`);
    console.log('方案 B 识别显示值:', valB, '诊断字符数量:', debugItemsCount);

    const shotPathBResult = path.join(ARTIFACT_DIR, 'lab_scheme_b_result.png');
    await client.captureScreenshot(shotPathBResult);

    console.log('全部方案截图与验证执行完毕！');
  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('运行异常:', err);
  process.exit(1);
});
