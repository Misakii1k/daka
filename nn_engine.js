// 纯本地离线 MNIST 神经网络前向推理引擎 (零外部依赖，极速纯 JS 实现)
(() => {
  'use strict';

  class NNEngine {
    constructor() {
      this.weights = window.MNIST_WEIGHTS || null;
      this.isReady = !!this.weights;
    }

    // 标准 MNIST 预处理：从笔画点集生成 28x28 居中灰度位图
    preprocessStrokes(strokes, box) {
      const size = 28;
      const innerSize = 20;

      // 1. 创建离屏画布渲染 20x20 保持纵横比的笔画
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);

      if (!strokes || strokes.length === 0 || !box) {
        return new Float32Array(784);
      }

      const bw = Math.max(box.w, 1);
      const bh = Math.max(box.h, 1);
      const scale = innerSize / Math.max(bw, bh);

      // 计算初级缩放居中位置
      const offX = (size - bw * scale) / 2;
      const offY = (size - bh * scale) / 2;

      ctx.save();
      ctx.translate(offX - box.minX * scale, offY - box.minY * scale);
      ctx.scale(scale, scale);

      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = Math.max(2.5, 3.2 / scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const st of strokes) {
        if (!st || st.length === 0) continue;
        if (st.length === 1) {
          ctx.beginPath();
          ctx.arc(st[0].x, st[0].y, 2.0 / scale, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(st[0].x, st[0].y);
        for (let i = 1; i < st.length; i++) {
          ctx.lineTo(st[i].x, st[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();

      // 2. 提取灰度并计算质心 (Center of Mass)
      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;

      let totalMass = 0;
      let massX = 0;
      let massY = 0;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const val = data[(y * size + x) * 4] / 255.0;
          if (val > 0.05) {
            totalMass += val;
            massX += x * val;
            massY += y * val;
          }
        }
      }

      // 3. 按质心平移至 (14, 14) 中心，完全对齐 MNIST 标准
      if (totalMass > 0.1) {
        const cx = massX / totalMass;
        const cy = massY / totalMass;
        const shiftX = Math.round(14 - cx);
        const shiftY = Math.round(14 - cy);

        if (shiftX !== 0 || shiftY !== 0) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = size;
          tempCanvas.height = size;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.fillStyle = '#000000';
          tempCtx.fillRect(0, 0, size, size);
          tempCtx.drawImage(canvas, shiftX, shiftY);

          const shiftedData = tempCtx.getImageData(0, 0, size, size).data;
          const inputVec = new Float32Array(784);
          for (let i = 0; i < 784; i++) {
            inputVec[i] = shiftedData[i * 4] / 255.0;
          }
          return inputVec;
        }
      }

      const inputVec = new Float32Array(784);
      for (let i = 0; i < 784; i++) {
        inputVec[i] = data[i * 4] / 255.0;
      }
      return inputVec;
    }

    // 前向推理：784 -> 64 -> 10 (耗时 < 0.3ms)
    predict(input784) {
      if (!this.weights) {
        this.weights = window.MNIST_WEIGHTS || null;
      }
      if (!this.weights) {
        return { digit: '', confidence: 0, probs: new Array(10).fill(0) };
      }

      const W = this.weights;
      const H = W.hiddenDim || 64;
      const w1 = W.w1;
      const b1 = W.b1;
      const w2 = W.w2;
      const b2 = W.b2;
      const s1 = W.scaleW1 || (1 / 127);
      const s2 = W.scaleW2 || (1 / 127);

      // 隐藏层: h = ReLU(W1 * x + b1)
      const h = new Float32Array(H);
      for (let r = 0; r < H; r++) {
        let sum = 0;
        const rowOffset = r * 784;
        for (let c = 0; c < 784; c++) {
          sum += w1[rowOffset + c] * input784[c];
        }
        const val = sum * s1 + b1[r];
        h[r] = val > 0 ? val : 0; // ReLU
      }

      // 输出层: z = W2 * h + b2
      const z = new Float32Array(10);
      for (let r = 0; r < 10; r++) {
        let sum = 0;
        const rowOffset = r * H;
        for (let c = 0; c < H; c++) {
          sum += w2[rowOffset + c] * h[c];
        }
        z[r] = sum * s2 + b2[r];
      }

      // Softmax
      let maxZ = -Infinity;
      for (let i = 0; i < 10; i++) if (z[i] > maxZ) maxZ = z[i];
      let sumExp = 0;
      const probs = new Float32Array(10);
      for (let i = 0; i < 10; i++) {
        probs[i] = Math.exp(z[i] - maxZ);
        sumExp += probs[i];
      }
      for (let i = 0; i < 10; i++) {
        probs[i] /= sumExp;
      }

      // 寻找最高概率
      let bestDigit = 0;
      let bestProb = -1;
      for (let i = 0; i < 10; i++) {
        if (probs[i] > bestProb) {
          bestProb = probs[i];
          bestDigit = i;
        }
      }

      return {
        digit: String(bestDigit),
        confidence: bestProb,
        probs: Array.from(probs)
      };
    }
  }

  window.NNEngine = new NNEngine();
})();
