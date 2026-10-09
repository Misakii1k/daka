// 纯前端离线仪式感打卡庆祝动效引擎 (两侧彩礼礼花 vs 顶部金钞飘落)
// 严格遵守规范：绝不使用任何 emoji
(() => {
  'use strict';

  let canvas = null;
  let ctx = null;
  let animId = null;
  let particles = [];
  let width = 0;
  let height = 0;

  function initCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'fx-celebration-canvas';
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '999';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);
  }

  // ==================== 1. 两侧彩礼烟花粒子 (Confetti) ====================
  const CONFETTI_COLORS = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308'
  ];

  class ConfettiParticle {
    constructor(x, y, angleDeg, speed) {
      this.type = 'confetti';
      this.x = x;
      this.y = y;
      const rad = (angleDeg * Math.PI) / 180;
      this.vx = Math.cos(rad) * speed + (Math.random() - 0.5) * 4;
      this.vy = -Math.sin(rad) * speed + (Math.random() - 0.5) * 3;
      this.color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

      this.sizeW = 7 + Math.random() * 8;
      this.sizeH = 10 + Math.random() * 10;
      this.rotation = Math.random() * Math.PI * 2;
      this.rotSpeed = (Math.random() - 0.5) * 0.25;
      this.flip = Math.random() * Math.PI * 2;
      this.flipSpeed = 0.08 + Math.random() * 0.12;

      this.gravity = 0.28 + Math.random() * 0.1;
      this.drag = 0.982;
      this.alpha = 1.0;
      this.decay = 0.003 + Math.random() * 0.004;
    }

    update() {
      this.vx *= this.drag;
      this.vy = this.vy * this.drag + this.gravity;
      this.x += this.vx;
      this.y += this.vy;
      this.rotation += this.rotSpeed;
      this.flip += this.flipSpeed;
      this.alpha -= this.decay;
      return this.alpha > 0 && this.y < height + 40;
    }

    draw(c) {
      c.save();
      c.translate(this.x, this.y);
      c.rotate(this.rotation);
      const scaleY = Math.sin(this.flip);
      c.scale(1, scaleY);
      c.globalAlpha = Math.max(0, this.alpha);
      c.fillStyle = this.color;
      c.fillRect(-this.sizeW / 2, -this.sizeH / 2, this.sizeW, this.sizeH);
      c.restore();
    }
  }

  // ==================== 2. 顶部飘落仿真钞票粒子 (Banknotes) ====================
  // 严格无 emoji，纯几何与线条绘制高质感纸币
  class BanknoteParticle {
    constructor(x, y) {
      this.type = 'banknote';
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 1.5;
      this.vy = 1.8 + Math.random() * 2.2;

      // 钞票尺寸
      this.w = 34 + Math.random() * 10;
      this.h = 18 + Math.random() * 5;

      // 钞票色系：金财绿或金黄
      const isGold = Math.random() > 0.45;
      this.bgColor = isGold ? '#fef08a' : '#d1fae5';
      this.borderColor = isGold ? '#ca8a04' : '#059669';
      this.accentColor = isGold ? '#eab308' : '#10b981';

      this.angle = Math.random() * Math.PI * 2;
      this.angleSpeed = (Math.random() - 0.5) * 0.04;

      // 空气摇摆摆动参数
      this.swayTime = Math.random() * Math.PI * 2;
      this.swaySpeed = 0.04 + Math.random() * 0.03;
      this.swayAmp = 1.6 + Math.random() * 1.2;

      this.flip = Math.random() * Math.PI * 2;
      this.flipSpeed = 0.05 + Math.random() * 0.06;

      this.alpha = 1.0;
      this.decay = 0.002 + Math.random() * 0.003;
    }

    update() {
      this.swayTime += this.swaySpeed;
      this.x += this.vx + Math.sin(this.swayTime) * this.swayAmp;
      this.y += this.vy;
      this.angle += this.angleSpeed;
      this.flip += this.flipSpeed;
      this.alpha -= this.decay;
      return this.alpha > 0 && this.y < height + 50;
    }

    draw(c) {
      c.save();
      c.translate(this.x, this.y);
      c.rotate(this.angle);
      const scaleY = Math.cos(this.flip);
      c.scale(1, scaleY);
      c.globalAlpha = Math.max(0, this.alpha);

      const hw = this.w / 2;
      const hh = this.h / 2;

      // 钞票主体底色
      c.fillStyle = this.bgColor;
      c.fillRect(-hw, -hh, this.w, this.h);

      // 钞票外边框
      c.strokeStyle = this.borderColor;
      c.lineWidth = 1.2;
      c.strokeRect(-hw, -hh, this.w, this.h);

      // 内衬防伪细线
      c.strokeStyle = this.accentColor;
      c.lineWidth = 0.6;
      c.strokeRect(-hw + 3, -hh + 2.5, this.w - 6, this.h - 5);

      // 中心防伪椭圆与金额记号
      c.beginPath();
      c.ellipse(0, 0, this.w * 0.22, this.h * 0.28, 0, 0, Math.PI * 2);
      c.stroke();

      // 两端装饰小条纹
      c.fillStyle = this.accentColor;
      c.fillRect(-hw + 4, -hh + 4, 2, this.h - 8);
      c.fillRect(hw - 6, -hh + 4, 2, this.h - 8);

      c.restore();
    }
  }

  // 动画主循环
  function loop() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    particles = particles.filter(p => {
      const alive = p.update();
      if (alive) p.draw(ctx);
      return alive;
    });

    if (particles.length > 0) {
      animId = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  function startLoop() {
    if (!animId) {
      animId = requestAnimationFrame(loop);
    }
  }

  // ==================== 触发接口 ====================

  // 1. 两侧喷发彩礼礼花
  function triggerCannons() {
    initCanvas();
    const countPerSide = 65;

    // 左下角发射（向右上倾斜 60-75 度）
    for (let i = 0; i < countPerSide; i++) {
      const angle = 55 + Math.random() * 25;
      const speed = 14 + Math.random() * 12;
      particles.push(new ConfettiParticle(10, height - 20, angle, speed));
    }

    // 右下角发射（向左上倾斜 105-125 度）
    for (let i = 0; i < countPerSide; i++) {
      const angle = 100 + Math.random() * 25;
      const speed = 14 + Math.random() * 12;
      particles.push(new ConfettiParticle(width - 10, height - 20, angle, speed));
    }

    startLoop();
  }

  // 2. 顶部飘落金钞雨
  function triggerBanknotes() {
    initCanvas();
    const totalBills = 55;

    for (let i = 0; i < totalBills; i++) {
      const x = Math.random() * width;
      const y = -20 - Math.random() * 220; // 阶梯式初始高度，自然连续落下
      particles.push(new BanknoteParticle(x, y));
    }

    startLoop();
  }

  // 3. 统一触发入口（支持根据用户偏好触发）
  function celebrate(type = 'confetti') {
    if (type === 'banknote') {
      triggerBanknotes();
    } else if (type === 'both') {
      triggerCannons();
      triggerBanknotes();
    } else {
      triggerCannons();
    }
  }

  window.CelebrationFX = {
    celebrate,
    triggerCannons,
    triggerBanknotes
  };
})();
