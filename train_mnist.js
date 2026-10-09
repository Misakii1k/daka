// 使用 Adam 优化器快速收敛训练 MNIST 多层感知机 (784 -> 64 -> 10)
const fs = require('fs');
const mnist = require('mnist');

console.log('加载 MNIST 数据集...');
const set = mnist.set(3000, 1000);
const training = set.training;
const test = set.test;

const INPUT_DIM = 784;
const HIDDEN_DIM = 64;
const OUTPUT_DIM = 10;

function createMatrix(rows, cols, scale) {
  const m = [];
  for (let r = 0; r < rows; r++) {
    const row = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      row[c] = (Math.random() * 2 - 1) * scale;
    }
    m.push(row);
  }
  return m;
}

const W1 = createMatrix(HIDDEN_DIM, INPUT_DIM, Math.sqrt(2.0 / INPUT_DIM));
const b1 = new Float32Array(HIDDEN_DIM);
const W2 = createMatrix(OUTPUT_DIM, HIDDEN_DIM, Math.sqrt(2.0 / HIDDEN_DIM));
const b2 = new Float32Array(OUTPUT_DIM);

// Adam 一阶和二阶矩
const mW1 = createMatrix(HIDDEN_DIM, INPUT_DIM, 0);
const vW1 = createMatrix(HIDDEN_DIM, INPUT_DIM, 0);
const mb1 = new Float32Array(HIDDEN_DIM);
const vb1 = new Float32Array(HIDDEN_DIM);

const mW2 = createMatrix(OUTPUT_DIM, HIDDEN_DIM, 0);
const vW2 = createMatrix(OUTPUT_DIM, HIDDEN_DIM, 0);
const mb2 = new Float32Array(OUTPUT_DIM);
const vb2 = new Float32Array(OUTPUT_DIM);

function relu(x) { return x > 0 ? x : 0; }
function drelu(x) { return x > 0 ? 1 : 0; }

function softmax(arr) {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  let sum = 0;
  const exp = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    exp[i] = Math.exp(arr[i] - max);
    sum += exp[i];
  }
  for (let i = 0; i < arr.length; i++) exp[i] /= sum;
  return exp;
}

const LR = 0.002;
const BETA1 = 0.9;
const BETA2 = 0.999;
const EPS = 1e-8;
const EPOCHS = 10;
const BATCH_SIZE = 32;

let tStep = 0;

console.log('开始使用 Adam 优化器训练...');

for (let epoch = 1; epoch <= EPOCHS; epoch++) {
  let totalLoss = 0;
  let correct = 0;

  // 打乱数据
  for (let i = training.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = training[i];
    training[i] = training[j];
    training[j] = tmp;
  }

  for (let i = 0; i < training.length; i += BATCH_SIZE) {
    const batch = training.slice(i, i + BATCH_SIZE);
    const B = batch.length;
    tStep++;

    // 梯度累加器
    const gW1 = createMatrix(HIDDEN_DIM, INPUT_DIM, 0);
    const gb1 = new Float32Array(HIDDEN_DIM);
    const gW2 = createMatrix(OUTPUT_DIM, HIDDEN_DIM, 0);
    const gb2 = new Float32Array(OUTPUT_DIM);

    for (let b = 0; b < B; b++) {
      const sample = batch[b];
      const x = sample.input;
      const y = sample.output;

      // 前向
      const hRaw = new Float32Array(HIDDEN_DIM);
      const h = new Float32Array(HIDDEN_DIM);
      for (let r = 0; r < HIDDEN_DIM; r++) {
        let sum = b1[r];
        const wRow = W1[r];
        for (let c = 0; c < INPUT_DIM; c++) sum += wRow[c] * x[c];
        hRaw[r] = sum;
        h[r] = relu(sum);
      }

      const z = new Float32Array(OUTPUT_DIM);
      for (let r = 0; r < OUTPUT_DIM; r++) {
        let sum = b2[r];
        const wRow = W2[r];
        for (let c = 0; c < HIDDEN_DIM; c++) sum += wRow[c] * h[c];
        z[r] = sum;
      }
      const p = softmax(z);

      // 统计
      let predIdx = 0, predMax = -1, labelIdx = 0;
      for (let k = 0; k < OUTPUT_DIM; k++) {
        if (p[k] > predMax) { predMax = p[k]; predIdx = k; }
        if (y[k] === 1) {
          labelIdx = k;
          totalLoss -= Math.log(Math.max(p[k], 1e-9));
        }
      }
      if (predIdx === labelIdx) correct++;

      // 反向
      const dZ2 = new Float32Array(OUTPUT_DIM);
      for (let k = 0; k < OUTPUT_DIM; k++) {
        const d = (p[k] - y[k]) / B;
        dZ2[k] = d;
        gb2[k] += d;
      }

      for (let r = 0; r < OUTPUT_DIM; r++) {
        const d = dZ2[r];
        const gRow = gW2[r];
        for (let c = 0; c < HIDDEN_DIM; c++) {
          gRow[c] += d * h[c];
        }
      }

      const dhRaw = new Float32Array(HIDDEN_DIM);
      for (let c = 0; c < HIDDEN_DIM; c++) {
        let sum = 0;
        for (let r = 0; r < OUTPUT_DIM; r++) {
          sum += W2[r][c] * dZ2[r];
        }
        dhRaw[c] = sum * drelu(hRaw[c]);
        gb1[c] += dhRaw[c];
      }

      for (let r = 0; r < HIDDEN_DIM; r++) {
        const d = dhRaw[r];
        const gRow = gW1[r];
        for (let c = 0; c < INPUT_DIM; c++) {
          gRow[c] += d * x[c];
        }
      }
    }

    // Adam 参数更新
    const beta1Pow = Math.pow(BETA1, tStep);
    const beta2Pow = Math.pow(BETA2, tStep);
    const alpha = LR * Math.sqrt(1 - beta2Pow) / (1 - beta1Pow);

    // 更新 W2, b2
    for (let r = 0; r < OUTPUT_DIM; r++) {
      mb2[r] = BETA1 * mb2[r] + (1 - BETA1) * gb2[r];
      vb2[r] = BETA2 * vb2[r] + (1 - BETA2) * (gb2[r] * gb2[r]);
      b2[r] -= alpha * mb2[r] / (Math.sqrt(vb2[r]) + EPS);

      const wRow = W2[r];
      const gRow = gW2[r];
      const mRow = mW2[r];
      const vRow = vW2[r];
      for (let c = 0; c < HIDDEN_DIM; c++) {
        const g = gRow[c];
        mRow[c] = BETA1 * mRow[c] + (1 - BETA1) * g;
        vRow[c] = BETA2 * vRow[c] + (1 - BETA2) * (g * g);
        wRow[c] -= alpha * mRow[c] / (Math.sqrt(vRow[c]) + EPS);
      }
    }

    // 更新 W1, b1
    for (let r = 0; r < HIDDEN_DIM; r++) {
      mb1[r] = BETA1 * mb1[r] + (1 - BETA1) * gb1[r];
      vb1[r] = BETA2 * vb1[r] + (1 - BETA2) * (gb1[r] * gb1[r]);
      b1[r] -= alpha * mb1[r] / (Math.sqrt(vb1[r]) + EPS);

      const wRow = W1[r];
      const gRow = gW1[r];
      const mRow = mW1[r];
      const vRow = vW1[r];
      for (let c = 0; c < INPUT_DIM; c++) {
        const g = gRow[c];
        mRow[c] = BETA1 * mRow[c] + (1 - BETA1) * g;
        vRow[c] = BETA2 * vRow[c] + (1 - BETA2) * (g * g);
        wRow[c] -= alpha * mRow[c] / (Math.sqrt(vRow[c]) + EPS);
      }
    }
  }

  const trainAcc = (correct / training.length * 100).toFixed(1);
  const avgLoss = (totalLoss / training.length).toFixed(3);
  console.log(`第 ${epoch}/${EPOCHS} 轮: 损失 ${avgLoss}, 训练准确率 ${trainAcc}%`);
}

// 评估测试集
let testCorrect = 0;
for (const sample of test) {
  const x = sample.input;
  const y = sample.output;

  const h = new Float32Array(HIDDEN_DIM);
  for (let r = 0; r < HIDDEN_DIM; r++) {
    let sum = b1[r];
    const wRow = W1[r];
    for (let c = 0; c < INPUT_DIM; c++) sum += wRow[c] * x[c];
    h[r] = relu(sum);
  }

  let predIdx = 0, predMax = -1;
  for (let r = 0; r < OUTPUT_DIM; r++) {
    let sum = b2[r];
    const wRow = W2[r];
    for (let c = 0; c < HIDDEN_DIM; c++) sum += wRow[c] * h[c];
    if (sum > predMax) { predMax = sum; predIdx = r; }
  }

  let labelIdx = 0;
  for (let k = 0; k < OUTPUT_DIM; k++) if (y[k] === 1) labelIdx = k;
  if (predIdx === labelIdx) testCorrect++;
}

const testAcc = (testCorrect / test.length * 100).toFixed(1);
console.log(`\n测试集准确率: ${testAcc}%！`);

// 导出为紧凑量化 JS 文件
const flattenedW1 = [];
for (let r = 0; r < HIDDEN_DIM; r++) {
  for (let c = 0; c < INPUT_DIM; c++) {
    flattenedW1.push(Math.round(W1[r][c] * 127));
  }
}

const flattenedW2 = [];
for (let r = 0; r < OUTPUT_DIM; r++) {
  for (let c = 0; c < HIDDEN_DIM; c++) {
    flattenedW2.push(Math.round(W2[r][c] * 127));
  }
}

const exportContent = `// 纯前端离线 MNIST 轻量神经网络预训练权重矩阵
// 架构: 784 -> 64 -> 10 (Adam 训练完成，测试准确率: ${testAcc}%)
window.MNIST_WEIGHTS = {
  hiddenDim: ${HIDDEN_DIM},
  scaleW1: ${1 / 127},
  scaleW2: ${1 / 127},
  b1: [${Array.from(b1).map(x => Number(x.toFixed(4))).join(',')}],
  b2: [${Array.from(b2).map(x => Number(x.toFixed(4))).join(',')}],
  w1: new Int8Array([${flattenedW1.join(',')}]),
  w2: new Int8Array([${flattenedW2.join(',')}])
};
`;

fs.writeFileSync('d:/打卡/nn_weights.js', exportContent);
console.log(`权重文件已成功导出至 d:/打卡/nn_weights.js，文件大小: ${(fs.statSync('d:/打卡/nn_weights.js').size / 1024).toFixed(1)} KB`);
