(() => {
  'use strict';

  // ---------- 存储 ----------
  const KEY_LOG = 'worklog';
  const KEY_SET = 'worklog-settings';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  let log = load(KEY_LOG, {});
  const HW_SPEED_MS = {
    instant: 100,
    fast: 180,
    balanced: 260,
    relaxed: 380
  };
  let settings = Object.assign({
    lunch: 60,
    std: 8,
    wage: 30,
    userName: '',
    routineIn: '08:30',
    routineOut: '17:30',
    celebrationFx: 'confetti',
    hwSpeed: 'fast',
    themeMode: 'system',
    textSize: 'standard',
    hapticEnabled: true,
    reminderInEnabled: true,
    reminderInTime: '08:20',
    reminderOutEnabled: true,
    reminderOutTime: '17:30',
    cloudUserId: '',
    storageMode: 'local',
    webdav: {
      url: '',
      user: '',
      pass: '',
      filename: 'worklog-backup.json'
    },
    routineLunch: { start: '12:00', end: '13:00', span: 60 }
  }, load(KEY_SET, {}));

  // 自愈校验：若历史缓存为 11:30~13:00 但 span 误存为 60 分钟，自动校正为真实 90 分钟
  if (settings.routineLunch) {
    if (settings.routineLunch.start === '11:30' && settings.routineLunch.end === '13:00' && settings.routineLunch.span === 60) {
      settings.routineLunch.span = 90;
    }
  }

  const saveLog = () => localStorage.setItem(KEY_LOG, JSON.stringify(log));
  const saveSet = () => localStorage.setItem(KEY_SET, JSON.stringify(settings));

  // ---------- 触感反馈引擎 ----------
  const Haptic = {
    tick() {
      if (settings.hapticEnabled !== false && navigator.vibrate) {
        try { navigator.vibrate(14); } catch {}
      }
    },
    tap() {
      if (settings.hapticEnabled !== false && navigator.vibrate) {
        try { navigator.vibrate(22); } catch {}
      }
    },
    success() {
      if (settings.hapticEnabled !== false && navigator.vibrate) {
        try { navigator.vibrate([24, 38, 48]); } catch {}
      }
    },
    warn() {
      if (settings.hapticEnabled !== false && navigator.vibrate) {
        try { navigator.vibrate([35, 55, 35]); } catch {}
      }
    }
  };

  // ---------- 主题与字号系统 ----------
  function applyTheme(mode) {
    const doc = document.documentElement;
    const update = () => {
      if (mode === 'light') {
        doc.setAttribute('data-theme', 'light');
      } else if (mode === 'dark') {
        doc.setAttribute('data-theme', 'dark');
      } else {
        doc.removeAttribute('data-theme');
      }
    };
    if (document.startViewTransition) {
      document.startViewTransition(update);
    } else {
      update();
    }
  }

  function applyTextSize(size) {
    const doc = document.documentElement;
    if (size === 'large' || size === 'huge') {
      doc.setAttribute('data-text-size', size);
    } else {
      doc.removeAttribute('data-text-size');
    }
  }

  // 初始化主题与字号
  applyTheme(settings.themeMode || 'system');
  applyTextSize(settings.textSize || 'standard');

  // ---------- 打卡提醒与通知服务 ----------
  let hasNotifiedTodayIn = false;
  let hasNotifiedTodayOut = false;
  let lastCheckedDateKey = '';

  async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
    return false;
  }

  async function sendNotification(title, body) {
    Haptic.warn();
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, {
          body,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: 'daka-reminder',
          renotify: true
        });
        return;
      } catch {}
    }
    try {
      new Notification(title, { body, icon: 'icons/icon-192.png' });
    } catch {}
  }

  function checkReminders() {
    const now = new Date();
    const k = keyOf(now);
    if (k !== lastCheckedDateKey) {
      lastCheckedDateKey = k;
      hasNotifiedTodayIn = false;
      hasNotifiedTodayOut = false;
    }

    const curTime = hhmm(now);
    const todayRec = log[k] || {};

    // 1. 上班提醒检测
    if (settings.reminderInEnabled && !hasNotifiedTodayIn && !todayRec.in) {
      const remInTime = settings.reminderInTime || '08:20';
      if (curTime === remInTime) {
        hasNotifiedTodayIn = true;
        sendNotification('上班打卡提醒', `已到达预定时间 ${remInTime}，请记得长按打卡记录工时`);
      }
    }

    // 2. 下班提醒检测
    if (settings.reminderOutEnabled && !hasNotifiedTodayOut && (!todayRec.out || !todayRec.in)) {
      const remOutTime = settings.reminderOutTime || '17:30';
      if (curTime === remOutTime) {
        hasNotifiedTodayOut = true;
        sendNotification('下班打卡提醒', `已到达下班时间 ${remOutTime}，请记得完成今日下班打卡`);
      }
    }
  }

  // ---------- 工具 ----------
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const toMin = t => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fmtHM = min => `${Math.floor(min / 60)}:${pad(Math.floor(min % 60))}`;
  const fmtH = min => (min / 60).toFixed(1);
  const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; };

  // 原始跨度（分钟），跨零点按次日
  const rawSpan = r => {
    if (!r || !r.in || !r.out) return null;
    let s = toMin(r.out) - toMin(r.in);
    if (s < 0) s += 1440;
    return s;
  };

  // 计入工时（扣除该条目的午休，或全局午休）
  const worked = r => {
    const s = rawSpan(r);
    if (s == null) return null;
    const lunchDeduct = (r && r.lunch != null) ? r.lunch : (settings.lunch || 0);
    return Math.max(0, s - lunchDeduct);
  };

  const isLive = r => !!r && !!r.in && !r.out && r === log[activeKey()];
  const isMissing = r => !!r && (!!r.in !== !!r.out) && !isLive(r);

  let toastTimer;
  const toast = msg => {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  };

  // 通用动画关闭辅助函数：为元素添加 closing 类播放退场动画后 hidden
  function animateClose(el, durationMs = 220) {
    if (!el || el.hidden) return;
    el.classList.add('closing');
    setTimeout(() => {
      el.hidden = true;
      el.classList.remove('closing');
    }, durationMs);
  }

  // 当前生效的记录日期
  const activeKey = () => keyOf(new Date());

  // ---------- 今天视图渲染 ----------
  function renderToday() {
    const k = activeKey();
    const r = log[k] || {};
    const d = dateOf(k);

    const hasRecorded = !!(r.in && r.out);
    let durMin = hasRecorded ? worked(r) : 0;

    // 状态文案
    const stateStr = hasRecorded ? `已记录 · ${fmtH(durMin)} 小时` : '今日未记录';
    $('t-date').textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${WD[d.getDay()]} · ${stateStr}`;
    $('t-dur').firstChild.nodeValue = fmtHM(durMin);

    // 时间带 0-24
    const seg = $('t-seg'), nowLine = $('t-now');
    const nowPct = (nowMin() / 1440) * 100;
    if (nowLine) {
      nowLine.style.left = `calc(${Math.min(nowPct, 100)}% - 1px)`;
      nowLine.style.display = hasRecorded ? 'none' : '';
    }

    if (seg) {
      if (r.in) {
        const start = toMin(r.in);
        let end = r.out ? toMin(r.out) : nowMin();
        if (end < start) end = 1440;
        seg.style.left = (start / 1440 * 100) + '%';
        seg.style.width = Math.max(0.6, (end - start) / 1440 * 100) + '%';
      } else {
        seg.style.width = '0';
      }
    }

    // 三栏
    $('t-in').querySelector('b').textContent = r.in || '--:--';
    $('t-out').querySelector('b').textContent = r.out || '--:--';

    const lunchMin = (r.lunch != null ? r.lunch : settings.lunch) || 0;
    const lunchCell = $('t-left');
    lunchCell.firstChild.nodeValue = '午休';
    lunchCell.querySelector('b').textContent = lunchMin ? (lunchMin + '分') : '--';

    // 宽幅打卡按钮状态更新
    const punchBtn = $('btn-quick-punch');
    const chargeFill = $('btn-charge-fill');
    const chargeGlow = $('btn-charge-glow');
    const titleTxt = $('m3-btn-title');
    const subTxt = $('m3-btn-sub');
    const adjBtn = $('btn-quick-adjust');

    const defaultIn = settings.routineIn || '08:30';
    const defaultOut = settings.routineOut || '17:30';

    if (punchBtn) {
      if (hasRecorded) {
        punchBtn.classList.add('punched');
        if (chargeFill) chargeFill.style.width = '0%';
        if (chargeGlow) chargeGlow.style.opacity = '0';
        if (titleTxt) titleTxt.textContent = `已打卡 · ${fmtH(durMin)} 小时`;
        if (subTxt) subTxt.textContent = `${r.in} – ${r.out}`;
        if (adjBtn) adjBtn.hidden = false;
      } else {
        punchBtn.classList.remove('punched');
        if (chargeFill) chargeFill.style.width = '0%';
        if (chargeGlow) chargeGlow.style.opacity = '0';
        if (titleTxt) titleTxt.textContent = '长按打卡';
        if (subTxt) subTxt.textContent = `${defaultIn} – ${defaultOut}`;
        if (adjBtn) adjBtn.hidden = true;
      }
    }
  }

  // ---------- 记录视图渲染 ----------
  let weekStart = mondayOf(new Date());
  let monthCur = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  function renderWeek() {
    const end = addDays(weekStart, 6);
    $('w-title').textContent = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`;
    const todayK = keyOf(new Date());
    let total = 0, html = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i), k = keyOf(d), r = log[k];
      let bar = '', h = '', hc = 'h';
      if (r && r.in && r.out) {
        const s = toMin(r.in);
        let e = s + rawSpan(r);
        if (e > 1440) e = 1440;
        bar = `<s style="left:${s / 1440 * 100}%;width:${(e - s) / 1440 * 100}%;animation-delay:${i * 50}ms"></s>`;
        const w = worked(r); total += w; h = fmtH(w);
      } else if (isMissing(r)) {
        const s = toMin(r.in || r.out);
        bar = `<s class="m" style="left:${Math.min(s / 1440 * 100, 94)}%;width:6%;animation-delay:${i * 50}ms"></s>`;
        h = '补卡'; hc = 'h miss';
      } else if (isLive(r)) {
        const s = toMin(r.in);
        const e = k === todayK ? Math.max(s, nowMin()) : 1440;
        bar = `<s style="left:${s / 1440 * 100}%;width:${Math.max(0.6, (e - s) / 1440 * 100)}%;opacity:.55;animation-delay:${i * 50}ms"></s>`;
        h = '进行中';
      }
      html += `<button type="button" class="r${k === todayK ? ' today' : ''}" data-k="${k}"><i>${WD[d.getDay()]}</i><div class="t">${bar}</div><span class="${hc}">${h}</span></button>`;
    }
    $('w-rows').innerHTML = html;
    $('w-total').firstChild.nodeValue = fmtH(total);
  }

  function monthKeys(m) {
    const prefix = `${m.getFullYear()}-${pad(m.getMonth() + 1)}-`;
    return Object.keys(log).filter(k => k.startsWith(prefix) && (log[k].in || log[k].out)).sort();
  }

  function renderMonth() {
    const keys = monthKeys(monthCur);
    let total = 0, days = 0;
    keys.forEach(k => { const w = worked(log[k]); if (w != null) { total += w; days++; } });
    $('m-title').innerHTML = `${monthCur.getFullYear()}年${monthCur.getMonth() + 1}月<small>${fmtH(total)} h · ${days} 天</small>`;
    if (!keys.length) { $('m-list').innerHTML = '<div class="empty">这个月还没有记录</div>'; return; }
    $('m-list').innerHTML = keys.reverse().map(k => {
      const r = log[k], d = dateOf(k);
      const miss = isMissing(r);
      const lunchInfo = (r.lunch != null ? r.lunch : settings.lunch) || 0;
      const sub = `${r.in || '--:--'} – ${r.out || '--:--'}${lunchInfo ? ` · 休${lunchInfo}分` : ''}`;
      const note = r.note ? ` · ${escapeHtml(r.note)}` : '';
      return `<button type="button" class="item${miss ? ' miss' : ''}" data-k="${k}"><span>${d.getDate()}日 ${WD[d.getDay()]}<small>${sub}${note}</small></span><b>${miss ? '补卡' : fmtH(worked(r)) + ' h'}</b></button>`;
    }).join('');
  }

  const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  $('w-prev').addEventListener('click', () => { weekStart = addDays(weekStart, -7); renderWeek(); });
  $('w-next').addEventListener('click', () => { weekStart = addDays(weekStart, 7); renderWeek(); });
  $('m-prev').addEventListener('click', () => { monthCur = new Date(monthCur.getFullYear(), monthCur.getMonth() - 1, 1); renderMonth(); });
  $('m-next').addEventListener('click', () => { monthCur = new Date(monthCur.getFullYear(), monthCur.getMonth() + 1, 1); renderMonth(); });

  // ---------- 记录修改与删除抽屉控制器 ----------
  let editingKey = null;

  function openEditSheet(key) {
    editingKey = key;
    const r = log[key] || {};
    const d = dateOf(key);
    $('e-title').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${WD[d.getDay()]}`;
    $('e-in').value = r.in || '';
    $('e-out').value = r.out || '';
    $('e-lunch').value = r.lunch != null ? r.lunch : (settings.lunch || 60);
    $('e-note').value = r.note || '';

    const hasData = !!(r.in || r.out);
    $('e-del').hidden = !hasData;

    $('mask').hidden = false;
    $('sheet').hidden = false;
  }

  function closeEditSheet() {
    animateClose($('sheet'), 200);
    animateClose($('mask'), 180);
    editingKey = null;
  }

  $('sheet').addEventListener('submit', e => {
    e.preventDefault();
    if (!editingKey) return;
    const inVal = $('e-in').value;
    const outVal = $('e-out').value;
    const lunchVal = Number($('e-lunch').value) || 0;
    const noteVal = $('e-note').value.trim();

    if (inVal && !isValidTimeStr(inVal)) {
      toast('上班时间不合法，小时需00~23，分钟需00~59');
      return;
    }
    if (outVal && !isValidTimeStr(outVal)) {
      toast('下班时间不合法，小时需00~23，分钟需00~59');
      return;
    }

    if (!inVal && !outVal && !noteVal) {
      delete log[editingKey];
    } else {
      const r = log[editingKey] || (log[editingKey] = {});
      r.in = inVal;
      r.out = outVal;
      r.lunch = lunchVal;
      r.note = noteVal;
    }
    saveLog();
    closeEditSheet();
    Haptic.success();
    renderAll();
    toast('已保存修改');
    autoSyncByStorageMode();
  });

  // 删除某天记录
  $('e-del').addEventListener('click', async () => {
    if (!editingKey) return;
    const ok = await window.customConfirm({
      title: '删除打卡记录',
      message: `确定要删除 ${editingKey} 的打卡记录吗？删除后不可撤销。`,
      confirmText: '删除记录',
      cancelText: '取消',
      isDanger: true
    });
    if (ok) {
      delete log[editingKey];
      saveLog();
      closeEditSheet();
      Haptic.warning();
      renderAll();
      toast('已删除该日打卡记录');
      autoSyncByStorageMode();
    }
  });

  $('e-cancel').addEventListener('click', closeEditSheet);
  $('mask').addEventListener('click', closeEditSheet);

  if ($('e-wiz')) {
    $('e-wiz').addEventListener('click', () => {
      const k = editingKey;
      closeEditSheet();
      openWizard(k);
    });
  }

  // 点击周记录或月记录某行，调起记录修改与删除抽屉
  $('w-rows').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) openEditSheet(b.dataset.k); });
  $('m-list').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) openEditSheet(b.dataset.k); });

  // ---------- 统计视图渲染 ----------
  let statMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  function renderStats() {
    const keys = monthKeys(statMonth);
    let total = 0, full = 0;
    const miss = [];
    keys.forEach(k => {
      const r = log[k], w = worked(r);
      if (w != null) { total += w; full++; }
      else if (isMissing(r)) miss.push(k);
    });
    $('s-title').textContent = `${statMonth.getFullYear()}年${statMonth.getMonth() + 1}月`;
    $('s-total').firstChild.nodeValue = fmtH(total);
    $('s-grid').className = 'grid-stats-3 num';
    $('s-grid').innerHTML =
      `<div class="stat-col">出勤天数<b>${keys.length}</b></div>` +
      `<div class="stat-col">日均工时<b>${full ? fmtH(total / full) : '0.0'} h</b></div>` +
      `<div class="stat-col">缺卡<b class="${miss.length ? 'warn' : ''}">${miss.length} 天</b></div>`;
    $('s-miss').innerHTML = miss.length
      ? '缺卡：' + miss.map(k => { const d = dateOf(k); return `${d.getMonth() + 1}月${d.getDate()}日`; }).join('、')
      : '';

    // 薪资核算卡片数据刷新
    const curWage = Number(settings.wage != null ? settings.wage : 30);
    if (window.SalaryExporter) {
      const rep = window.SalaryExporter.computeMonthReportData(statMonth, log, settings, curWage, settings.userName);
      $('s-salary-val').textContent = `￥${rep.totalSalary.toFixed(2)}`;
      $('sc-rate-tag').textContent = `时薪 ${curWage} 元/小时`;
    }
  }

  $('s-prev').addEventListener('click', () => { statMonth = new Date(statMonth.getFullYear(), statMonth.getMonth() - 1, 1); renderStats(); });
  $('s-next').addEventListener('click', () => { statMonth = new Date(statMonth.getFullYear(), statMonth.getMonth() + 1, 1); renderStats(); });

  // ---------- 设置与偏好交互绑定 ----------
  if ($('set-theme')) $('set-theme').value = settings.themeMode || 'system';
  if ($('set-text-size')) $('set-text-size').value = settings.textSize || 'standard';
  if ($('set-haptic')) $('set-haptic').checked = settings.hapticEnabled !== false;

  if ($('set-reminder-in')) $('set-reminder-in').checked = settings.reminderInEnabled !== false;
  if ($('set-reminder-in-time')) $('set-reminder-in-time').value = settings.reminderInTime || '08:20';
  if ($('set-reminder-out')) $('set-reminder-out').checked = settings.reminderOutEnabled !== false;
  if ($('set-reminder-out-time')) $('set-reminder-out-time').value = settings.reminderOutTime || '17:30';
  if ($('set-user-id')) $('set-user-id').value = settings.cloudUserId || '';

  $('set-wage').value = settings.wage != null ? settings.wage : 30;
  if ($('set-hw-speed')) $('set-hw-speed').value = settings.hwSpeed || 'fast';
  if ($('set-celebration')) $('set-celebration').value = settings.celebrationFx || 'confetti';
  $('set-lunch').value = settings.lunch;
  $('set-std').value = settings.std;

  // 1. 主题分段胶囊切换器 (Segmented Tabs·像素级自适应贴合滑块)
  function updateThemeSegUI(mode) {
    const tabsContainer = $('theme-seg-tabs');
    const tabs = document.querySelectorAll('#theme-seg-tabs .m3-seg-tab');
    const indicator = $('theme-seg-indicator');
    const modes = ['system', 'light', 'dark'];
    const idx = modes.indexOf(mode);
    const targetIdx = idx !== -1 ? idx : 0;

    tabs.forEach((tab, i) => {
      tab.classList.toggle('on', i === targetIdx);
    });

    if (indicator && tabsContainer && tabs[targetIdx]) {
      const activeTab = tabs[targetIdx];
      const left = activeTab.offsetLeft;
      const top = activeTab.offsetTop;
      const width = activeTab.offsetWidth;
      const height = activeTab.offsetHeight;
      if (width > 0 && height > 0) {
        indicator.style.width = `${width}px`;
        indicator.style.height = `${height}px`;
        indicator.style.top = `${top}px`;
        indicator.style.left = '0px';
        indicator.style.transform = `translateX(${left}px)`;
      } else {
        indicator.style.width = 'calc((100% - 14px) / 3)';
        indicator.style.transform = `translateX(calc(${targetIdx} * (100% + 4px)))`;
      }
    }
  }

  window.addEventListener('resize', () => {
    updateThemeSegUI(settings.themeMode || 'system');
  });

  const themeSegTabs = $('theme-seg-tabs');
  if (themeSegTabs) {
    themeSegTabs.querySelectorAll('.m3-seg-tab').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.theme;
        settings.themeMode = mode;
        saveSet();
        applyTheme(mode);
        updateThemeSegUI(mode);
        if ($('set-theme')) $('set-theme').value = mode;
        Haptic.tap();
        toast('已切换主题');
      });
    });
    // 延迟与初始确保布局计算就绪
    requestAnimationFrame(() => updateThemeSegUI(settings.themeMode || 'system'));
  }

  if ($('set-theme')) {
    $('set-theme').addEventListener('change', e => {
      settings.themeMode = e.target.value;
      saveSet();
      applyTheme(settings.themeMode);
      updateThemeSegUI(settings.themeMode);
    });
  }

  // 2. 全局通用自绘下拉抽屉选择器 (Custom Bottom Sheet Picker)
  function openCustomPicker({ title = '请选择', options = [], currentValue = '', onSelect = null }) {
    const sheet = $('custom-picker-sheet');
    const mask = $('custom-picker-mask');
    const titleEl = $('custom-picker-title');
    const container = $('custom-picker-options');
    if (!sheet || !mask || !container) return;

    if (titleEl) titleEl.textContent = title;

    container.innerHTML = options.map(opt => {
      const isSelected = String(opt.value) === String(currentValue);
      return `
        <button type="button" class="custom-picker-item ${isSelected ? 'on' : ''}" data-val="${opt.value}">
          <div class="custom-picker-item-label">
            <span>${opt.label || opt.text || opt.value}</span>
            ${opt.desc ? `<span class="custom-picker-item-desc">${opt.desc}</span>` : ''}
          </div>
          <div class="custom-picker-check">
            ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </div>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.custom-picker-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        Haptic.tick();
        if (typeof onSelect === 'function') onSelect(val);
        closeCustomPicker();
      });
    });

    mask.hidden = false;
    sheet.hidden = false;
  }

  function closeCustomPicker() {
    animateClose($('custom-picker-sheet'), 220);
    animateClose($('custom-picker-mask'), 180);
  }

  if ($('custom-picker-close')) $('custom-picker-close').addEventListener('click', closeCustomPicker);
  if ($('custom-picker-mask')) $('custom-picker-mask').addEventListener('click', closeCustomPicker);

  // 包装原生 select 为统一自绘控件
  function initCustomSelectEnhancer(selectId, pickerTitle) {
    const select = $(selectId);
    if (!select) return;

    select.style.display = 'none';

    let trigger = select.parentNode.querySelector(`.m3-picker-trigger[data-target="${selectId}"]`);
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'm3-picker-trigger';
      trigger.dataset.target = selectId;
      trigger.innerHTML = `
        <span class="m3-trigger-text"></span>
        <svg class="m3-trigger-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      `;
      select.parentNode.insertBefore(trigger, select);
    }

    const updateTriggerText = () => {
      const selectedOpt = select.options[select.selectedIndex];
      const textSpan = trigger.querySelector('.m3-trigger-text');
      if (textSpan && selectedOpt) {
        textSpan.textContent = selectedOpt.text;
      }
    };

    updateTriggerText();
    select.addEventListener('change', updateTriggerText);

    trigger.addEventListener('click', () => {
      const opts = Array.from(select.options).map(o => ({
        value: o.value,
        label: o.text
      }));
      openCustomPicker({
        title: pickerTitle || '请选择',
        options: opts,
        currentValue: select.value,
        onSelect: val => {
          if (select.value !== val) {
            select.value = val;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
    });
  }

  // 初始化所有多项下拉配置项
  initCustomSelectEnhancer('set-text-size', '选择文字大小');
  initCustomSelectEnhancer('set-celebration', '选择打卡庆祝动效');
  initCustomSelectEnhancer('set-hw-speed', '手写识别响应速度');
  initCustomSelectEnhancer('em-theme-select', '选择工时单据样式');

  // 文字大小切换监听
  if ($('set-text-size')) {
    $('set-text-size').addEventListener('change', e => {
      settings.textSize = e.target.value;
      saveSet();
      applyTextSize(settings.textSize);
      Haptic.tap();
      toast('已调整文字大小');
    });
  }

  // 3. 全局通用自绘双滚轮时间抽屉 (Custom Time Picker Sheet)
  let activeTimeConfirmCallback = null;
  let currentSelectedH = 8;
  let currentSelectedM = 30;

  function initTimeWheelData() {
    const trackH = $('ctp-track-h');
    const trackM = $('ctp-track-m');
    if (!trackH || !trackM) return;

    if (trackH.children.length === 0) {
      let hHtml = '';
      for (let h = 0; h < 24; h++) {
        hHtml += `<div class="ctp-wheel-item" data-val="${h}">${pad(h)}</div>`;
      }
      trackH.innerHTML = hHtml;
    }

    if (trackM.children.length === 0) {
      let mHtml = '';
      for (let m = 0; m < 60; m++) {
        mHtml += `<div class="ctp-wheel-item" data-val="${m}">${pad(m)}</div>`;
      }
      trackM.innerHTML = mHtml;
    }
  }

  function scrollWheelToValue(viewportEl, val, smooth = true) {
    if (!viewportEl) return;
    const itemH = 38;
    viewportEl.scrollTo({
      top: val * itemH,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  function setupWheelScrollListener(viewportEl, onSelect) {
    if (!viewportEl || viewportEl.dataset.hasListener) return;
    viewportEl.dataset.hasListener = 'true';
    const itemH = 38;
    let timer = null;

    const onScroll = () => {
      clearTimeout(timer);
      const scrollTop = viewportEl.scrollTop;
      const idx = Math.max(0, Math.round(scrollTop / itemH));
      const items = viewportEl.querySelectorAll('.ctp-wheel-item');
      items.forEach((it, i) => {
        it.classList.toggle('on', i === idx);
      });
      timer = setTimeout(() => {
        if (typeof onSelect === 'function') onSelect(idx);
      }, 50);
    };

    viewportEl.addEventListener('scroll', onScroll, { passive: true });

    viewportEl.addEventListener('click', e => {
      const it = e.target.closest('.ctp-wheel-item');
      if (!it) return;
      const val = Number(it.dataset.val);
      scrollWheelToValue(viewportEl, val, true);
      Haptic.tick();
    });
  }

  function openCustomTimePicker({ title = '选择时间', initialTime = '08:30', onConfirm = null }) {
    const sheet = $('custom-time-sheet');
    const mask = $('custom-time-mask');
    const titleEl = $('custom-time-title');
    if (!sheet || !mask) return;

    if (titleEl) titleEl.textContent = title;
    activeTimeConfirmCallback = onConfirm;

    initTimeWheelData();

    const parts = (initialTime || '08:30').split(':');
    currentSelectedH = parseInt(parts[0], 10) || 8;
    currentSelectedM = parseInt(parts[1], 10) || 0;

    const dispH = $('ctp-disp-h');
    const dispM = $('ctp-disp-m');
    if (dispH) dispH.textContent = pad(currentSelectedH);
    if (dispM) dispM.textContent = pad(currentSelectedM);

    const vh = $('ctp-wheel-h');
    const vm = $('ctp-wheel-m');

    setupWheelScrollListener(vh, h => {
      currentSelectedH = Math.min(23, Math.max(0, h));
      if (dispH) dispH.textContent = pad(currentSelectedH);
      Haptic.tick();
    });

    setupWheelScrollListener(vm, m => {
      currentSelectedM = Math.min(59, Math.max(0, m));
      if (dispM) dispM.textContent = pad(currentSelectedM);
      Haptic.tick();
    });

    mask.hidden = false;
    sheet.hidden = false;

    setTimeout(() => {
      scrollWheelToValue(vh, currentSelectedH, false);
      scrollWheelToValue(vm, currentSelectedM, false);
      const itemsH = vh.querySelectorAll('.ctp-wheel-item');
      itemsH.forEach((it, i) => it.classList.toggle('on', i === currentSelectedH));
      const itemsM = vm.querySelectorAll('.ctp-wheel-item');
      itemsM.forEach((it, i) => it.classList.toggle('on', i === currentSelectedM));
    }, 60);
  }

  function closeCustomTimePicker() {
    animateClose($('custom-time-sheet'), 220);
    animateClose($('custom-time-mask'), 180);
    activeTimeConfirmCallback = null;
  }

  if ($('custom-time-close')) $('custom-time-close').addEventListener('click', closeCustomTimePicker);
  if ($('custom-time-mask')) $('custom-time-mask').addEventListener('click', closeCustomTimePicker);
  if ($('ctp-cancel-btn')) $('ctp-cancel-btn').addEventListener('click', closeCustomTimePicker);

  if ($('ctp-confirm-btn')) {
    $('ctp-confirm-btn').addEventListener('click', () => {
      const timeStr = `${pad(currentSelectedH)}:${pad(currentSelectedM)}`;
      if (typeof activeTimeConfirmCallback === 'function') {
        activeTimeConfirmCallback(timeStr);
      }
      Haptic.success();
      closeCustomTimePicker();
    });
  }

  document.querySelectorAll('.ctp-preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const time = chip.dataset.time;
      if (!time) return;
      const [h, m] = time.split(':').map(Number);
      currentSelectedH = h;
      currentSelectedM = m;
      if ($('ctp-disp-h')) $('ctp-disp-h').textContent = pad(h);
      if ($('ctp-disp-m')) $('ctp-disp-m').textContent = pad(m);
      scrollWheelToValue($('ctp-wheel-h'), h, true);
      scrollWheelToValue($('ctp-wheel-m'), m, true);
      Haptic.tap();
    });
  });

  function setupCustomTimeInputs() {
    const timeInputs = document.querySelectorAll('input[type="time"]');
    timeInputs.forEach(input => {
      input.setAttribute('readonly', 'readonly');
      input.style.cursor = 'pointer';

      input.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const currentVal = input.value || '08:30';
        let title = '选择时间';
        const label = input.closest('label');
        if (label) {
          title = label.textContent.trim().replace(/:|：/g, '').slice(0, 10);
        } else if (input.id.includes('in')) {
          title = '选择上班时间';
        } else if (input.id.includes('out')) {
          title = '选择下班时间';
        }

        openCustomTimePicker({
          title,
          initialTime: currentVal,
          onConfirm: selectedTime => {
            input.value = selectedTime;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
    });
  }

  // 拦截全局时间输入
  setupCustomTimeInputs();

  // 4. 全局通用自绘确认模态弹窗 (替代原生 confirm)
  window.customConfirm = function({ title = '操作确认', message = '', confirmText = '确定', cancelText = '取消', isDanger = false } = {}) {
    return new Promise(resolve => {
      const modal = $('custom-confirm-modal');
      const mask = $('custom-confirm-mask');
      const titleEl = $('ccm-title');
      const msgEl = $('ccm-message');
      const confirmBtn = $('ccm-confirm-btn');
      const cancelBtn = $('ccm-cancel-btn');
      const iconWrap = $('ccm-icon-wrap');

      if (!modal || !mask) {
        resolve(window.confirm(message || title));
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (confirmBtn) {
        confirmBtn.textContent = confirmText;
        confirmBtn.classList.toggle('danger', !!isDanger);
      }
      if (cancelBtn) cancelBtn.textContent = cancelText;
      if (iconWrap) iconWrap.classList.toggle('danger', !!isDanger);

      const cleanup = res => {
        modal.classList.add('closing');
        animateClose(mask, 180);
        setTimeout(() => {
          modal.hidden = true;
          modal.classList.remove('closing');
        }, 180);
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        mask.onclick = null;
        resolve(res);
      };

      confirmBtn.onclick = () => {
        Haptic.tick();
        cleanup(true);
      };

      cancelBtn.onclick = () => {
        Haptic.tap();
        cleanup(false);
      };

      mask.onclick = () => {
        cleanup(false);
      };

      modal.classList.remove('closing');
      mask.hidden = false;
      modal.hidden = false;
    });
  };

  // 触感反馈开关
  if ($('set-haptic')) {
    $('set-haptic').addEventListener('change', e => {
      settings.hapticEnabled = e.target.checked;
      saveSet();
      Haptic.tap();
      toast(settings.hapticEnabled ? '已开启触感反馈' : '已关闭触感反馈');
    });
  }

  // 打卡提醒配置与测试
  if ($('set-reminder-in')) {
    $('set-reminder-in').addEventListener('change', async e => {
      settings.reminderInEnabled = e.target.checked;
      saveSet();
      Haptic.tick();
      if (settings.reminderInEnabled) await requestNotificationPermission();
    });
  }
  if ($('set-reminder-in-time')) {
    $('set-reminder-in-time').addEventListener('change', e => {
      settings.reminderInTime = e.target.value || '08:20';
      saveSet();
      Haptic.tick();
    });
  }
  if ($('set-reminder-out')) {
    $('set-reminder-out').addEventListener('change', async e => {
      settings.reminderOutEnabled = e.target.checked;
      saveSet();
      Haptic.tick();
      if (settings.reminderOutEnabled) await requestNotificationPermission();
    });
  }
  if ($('set-reminder-out-time')) {
    $('set-reminder-out-time').addEventListener('change', e => {
      settings.reminderOutTime = e.target.value || '17:30';
      saveSet();
      Haptic.tick();
    });
  }
  if ($('btn-test-notification')) {
    $('btn-test-notification').addEventListener('click', async () => {
      Haptic.tap();
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast('请先在浏览器或系统设置中允许通知权限');
        return;
      }
      sendNotification('工时打卡提醒', '测试提醒通知已就绪：到点将提醒您按时打卡');
      toast('已发送测试提醒');
    });
  }

  // ---------- 多端存储三联分段器与数据同步控制器 ----------
  const storageTabs = $('storage-tabs');
  const storagePanels = {
    local: $('storage-panel-local'),
    cloudflare: $('storage-panel-cloudflare'),
    webdav: $('storage-panel-webdav')
  };
  const storageDescEl = $('storage-current-desc');

  function switchStorageMode(mode) {
    const validMode = (mode === 'cloudflare' || mode === 'webdav') ? mode : 'local';
    settings.storageMode = validMode;
    saveSet();

    if (storageTabs) {
      storageTabs.querySelectorAll('.storage-tab').forEach(tab => {
        tab.classList.toggle('on', tab.dataset.storage === validMode);
      });
    }

    Object.keys(storagePanels).forEach(k => {
      const p = storagePanels[k];
      if (!p) return;
      if (k === validMode) {
        p.hidden = false;
        p.classList.add('on');
      } else {
        p.hidden = true;
        p.classList.remove('on');
      }
    });

    if (storageDescEl) {
      if (validMode === 'local') storageDescEl.textContent = '默认本地离线 · 数据安全私密';
      else if (validMode === 'cloudflare') storageDescEl.textContent = 'Cloudflare D1 · 免费跨设备同步';
      else if (validMode === 'webdav') storageDescEl.textContent = 'WebDAV 个人网盘 · 自主保管数据';
    }
  }

  if (storageTabs) {
    storageTabs.addEventListener('click', e => {
      const tab = e.target.closest('.storage-tab');
      if (!tab) return;
      Haptic.tick();
      switchStorageMode(tab.dataset.storage);
    });
  }

  // 初始化存储分段
  switchStorageMode(settings.storageMode || 'local');

  // Cloudflare 云端数据库同步服务 (D1 极简免配置架构)
  function ensureCloudUserId() {
    if (!settings.cloudUserId || !settings.cloudUserId.trim()) {
      const rand = Math.random().toString(36).substring(2, 6);
      settings.cloudUserId = `dk-${rand}`;
      saveSet();
    }
    return settings.cloudUserId;
  }

  function getCloudSyncUrl() {
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) 
      || location.hostname === 'localhost' 
      || location.protocol === 'file:'
      || !location.origin.includes('pages.dev');
    return isNative ? `${CLOUD_PAGES_ORIGIN}/api/sync` : '/api/sync';
  }

  if ($('set-user-id')) {
    $('set-user-id').value = ensureCloudUserId();
    $('set-user-id').addEventListener('change', e => {
      let val = e.target.value.trim();
      if (!val) val = ensureCloudUserId();
      settings.cloudUserId = val;
      e.target.value = val;
      saveSet();
      Haptic.tick();
    });
  }

  if ($('btn-copy-cloud-id')) {
    $('btn-copy-cloud-id').addEventListener('click', async () => {
      const code = ensureCloudUserId();
      try {
        await navigator.clipboard.writeText(code);
        Haptic.success();
        toast(`已复制同步码：${code}，在其他设备填入即可`);
      } catch {
        toast(`专属同步码：${code}`);
      }
    });
  }

  if ($('btn-gen-cloud-id')) {
    $('btn-gen-cloud-id').addEventListener('click', () => {
      const rand = Math.random().toString(36).substring(2, 6);
      settings.cloudUserId = `dk-${rand}`;
      if ($('set-user-id')) $('set-user-id').value = settings.cloudUserId;
      saveSet();
      Haptic.tick();
      toast(`已生成新同步码：${settings.cloudUserId}`);
    });
  }

  if ($('set-auto-cloud-sync')) {
    $('set-auto-cloud-sync').checked = settings.autoCloudSync !== false;
    $('set-auto-cloud-sync').addEventListener('change', e => {
      settings.autoCloudSync = e.target.checked;
      saveSet();
      Haptic.tap();
      toast(settings.autoCloudSync ? '已开启打卡自动同步' : '已关闭打卡自动同步');
    });
  }

  // 极简一键双向智能合并同步
  async function syncCloudflareBidirectional(silent = false) {
    const statusEl = $('cloud-sync-status');
    const userId = ensureCloudUserId();
    const url = getCloudSyncUrl();
    if (statusEl) statusEl.textContent = '正在连接云端双向同步...';
    try {
      // 1. 获取云端已有打卡记录与设置
      let cloudLog = {};
      try {
        const getRes = await fetch(url, {
          headers: { 'X-User-Id': userId }
        });
        if (getRes.ok) {
          const getData = await getRes.json();
          if (getData && getData.ok && getData.log) {
            cloudLog = getData.log;
          }
        }
      } catch (e) {
        console.warn('读取云端数据降级:', e);
      }

      // 2. 双向智能合并：最新 updatedAt 为准
      const mergedLog = Object.assign({}, log);
      let mergedCount = 0;
      for (const [d, cRec] of Object.entries(cloudLog)) {
        if (!mergedLog[d]) {
          mergedLog[d] = cRec;
          mergedCount++;
        } else {
          const localTime = mergedLog[d].updatedAt || 0;
          const cloudTime = (cRec && cRec.updatedAt) || 0;
          if (cloudTime > localTime) {
            mergedLog[d] = cRec;
            mergedCount++;
          }
        }
      }
      log = mergedLog;
      saveLog();
      renderAll();

      // 3. 将合并后的完整数据回写到 D1 云端
      const postRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        },
        body: JSON.stringify({ log: mergedLog, settings })
      });
      if (postRes.ok) {
        const postData = await postRes.json();
        if (postData && postData.ok) {
          const total = Object.keys(mergedLog).length;
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (statusEl) statusEl.textContent = `云端已同步 · 共 ${total} 条记录 · ${timeStr}`;
          if (!silent) {
            Haptic.success();
            toast(`智能双向同步完成 · 云端共 ${total} 条记录`);
          }
          return true;
        }
      }
      if (statusEl) statusEl.textContent = '本地优先 · 离线已安全保存';
      if (!silent) toast('已保存在本地，网络恢复后自动同步');
      return false;
    } catch (err) {
      if (statusEl) statusEl.textContent = '本地优先 · 离线已安全保存';
      if (!silent) toast('已保存在本地，网络恢复后自动同步');
      return false;
    }
  }

  async function pushToCloudflare(silent = false) {
    const statusEl = $('cloud-sync-status');
    const userId = ensureCloudUserId();
    const url = getCloudSyncUrl();
    if (statusEl) statusEl.textContent = '正在备份至云端...';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        },
        body: JSON.stringify({ log, settings })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          const count = Object.keys(log).length;
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (statusEl) statusEl.textContent = `云端已备份 · 共 ${count} 条记录 · ${timeStr}`;
          if (!silent) {
            Haptic.success();
            toast(`已备份 ${count} 条记录到 Cloudflare`);
          }
          return true;
        }
      }
      if (statusEl) statusEl.textContent = '本地优先 · 离线已保存';
      if (!silent) toast('已保存在本地');
      return false;
    } catch {
      if (statusEl) statusEl.textContent = '本地优先 · 离线已保存';
      if (!silent) toast('已保存在本地');
      return false;
    }
  }

  async function pullFromCloudflare() {
    const statusEl = $('cloud-sync-status');
    const userId = ensureCloudUserId();
    const url = getCloudSyncUrl();
    if (statusEl) statusEl.textContent = '正在从云端读取...';
    try {
      const res = await fetch(url, {
        headers: { 'X-User-Id': userId }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.log) {
          const cloudKeys = Object.keys(data.log);
          if (cloudKeys.length > 0) {
            log = Object.assign({}, log, data.log);
            saveLog();
            renderAll();
            if (statusEl) statusEl.textContent = `云端已拉取 · 共 ${cloudKeys.length} 条记录`;
            Haptic.success();
            toast(`已恢复云端 ${cloudKeys.length} 条打卡记录`);
            return;
          }
        }
      }
      if (statusEl) statusEl.textContent = '云端暂无记录，以本地为准';
      toast('云端暂无更多记录');
    } catch {
      if (statusEl) statusEl.textContent = '连接云端超时，以本地为准';
      toast('无法连接云端，请检查网络');
    }
  }

  if ($('btn-cloud-sync-onekey')) $('btn-cloud-sync-onekey').addEventListener('click', () => syncCloudflareBidirectional(false));
  if ($('btn-cloud-push')) $('btn-cloud-push').addEventListener('click', () => pushToCloudflare(false));
  if ($('btn-cloud-pull')) $('btn-cloud-pull').addEventListener('click', () => pullFromCloudflare());

  // WebDAV 网盘同步服务
  const webdavConfig = settings.webdav || { url: '', user: '', pass: '', filename: 'worklog-backup.json' };
  if ($('set-webdav-url')) {
    $('set-webdav-url').value = webdavConfig.url || '';
    $('set-webdav-url').addEventListener('change', e => {
      if (!settings.webdav) settings.webdav = {};
      settings.webdav.url = e.target.value.trim();
      saveSet();
    });
  }
  if ($('set-webdav-user')) {
    $('set-webdav-user').value = webdavConfig.user || '';
    $('set-webdav-user').addEventListener('change', e => {
      if (!settings.webdav) settings.webdav = {};
      settings.webdav.user = e.target.value.trim();
      saveSet();
    });
  }
  if ($('set-webdav-pass')) {
    $('set-webdav-pass').value = webdavConfig.pass || '';
    $('set-webdav-pass').addEventListener('change', e => {
      if (!settings.webdav) settings.webdav = {};
      settings.webdav.pass = e.target.value.trim();
      saveSet();
    });
  }
  if ($('set-webdav-file')) {
    $('set-webdav-file').value = webdavConfig.filename || 'worklog-backup.json';
    $('set-webdav-file').addEventListener('change', e => {
      if (!settings.webdav) settings.webdav = {};
      settings.webdav.filename = e.target.value.trim() || 'worklog-backup.json';
      saveSet();
    });
  }

  async function testWebDAVConnection() {
    if (!window.WebDAVClient) {
      toast('WebDAV 组件尚未就绪');
      return;
    }
    const statusEl = $('webdav-sync-status');
    if (statusEl) statusEl.textContent = '正在测试连接...';
    Haptic.tap();
    const res = await window.WebDAVClient.testConnection(settings.webdav);
    if (res.ok) {
      if (statusEl) statusEl.textContent = '连接成功 · 网盘正常';
      Haptic.success();
      toast('WebDAV 网盘连接成功');
    } else {
      if (statusEl) statusEl.textContent = res.message || '连接失败';
      Haptic.warn();
      toast(res.message || '连接失败，请检查地址与密码');
    }
  }

  async function pushToWebDAV(silent = false) {
    if (!window.WebDAVClient) return false;
    if (!settings.webdav || !settings.webdav.url) {
      if (!silent) toast('请先填写 WebDAV 网盘地址');
      return false;
    }
    const statusEl = $('webdav-sync-status');
    if (statusEl) statusEl.textContent = '正在备份到网盘...';
    const payload = {
      app: 'worklog',
      version: 2,
      updatedAt: new Date().toISOString(),
      log,
      settings
    };
    const res = await window.WebDAVClient.uploadBackup(settings.webdav, payload);
    if (res.ok) {
      const count = Object.keys(log).length;
      if (statusEl) statusEl.textContent = `已备份 ${count} 条记录到网盘`;
      if (!silent) {
        Haptic.success();
        toast('已成功备份到 WebDAV 网盘');
      }
      return true;
    } else {
      if (statusEl) statusEl.textContent = res.message || '备份失败';
      if (!silent) {
        Haptic.warn();
        toast(res.message || '备份失败，请检查网盘');
      }
      return false;
    }
  }

  async function pullFromWebDAV() {
    if (!window.WebDAVClient) return;
    if (!settings.webdav || !settings.webdav.url) {
      toast('请先填写 WebDAV 网盘地址');
      return;
    }
    const statusEl = $('webdav-sync-status');
    if (statusEl) statusEl.textContent = '正在从网盘读取...';
    Haptic.tap();
    const res = await window.WebDAVClient.downloadBackup(settings.webdav);
    if (res.ok && res.data && res.data.log) {
      const cloudKeys = Object.keys(res.data.log);
      if (cloudKeys.length === 0) {
        if (statusEl) statusEl.textContent = '网盘备份中暂无打卡记录';
        toast('网盘中没有打卡记录');
        return;
      }
      const ok = await window.customConfirm({
        title: '网盘数据合并',
        message: `从网盘恢复 ${cloudKeys.length} 天打卡记录，确定与本地数据合并吗？`,
        confirmText: '合并恢复',
        cancelText: '取消'
      });
      if (!ok) return;
      log = Object.assign({}, log, res.data.log);
      saveLog();
      renderAll();
      if (statusEl) statusEl.textContent = `已恢复网盘 ${cloudKeys.length} 条记录`;
      Haptic.success();
      toast(`已恢复网盘 ${cloudKeys.length} 条记录`);
    } else {
      if (statusEl) statusEl.textContent = res.message || '读取失败';
      Haptic.warn();
      toast(res.message || '无法读取网盘备份文件');
    }
  }

  if ($('btn-webdav-test')) $('btn-webdav-test').addEventListener('click', testWebDAVConnection);
  if ($('btn-webdav-push')) $('btn-webdav-push').addEventListener('click', () => pushToWebDAV(false));
  if ($('btn-webdav-pull')) $('btn-webdav-pull').addEventListener('click', pullFromWebDAV);

  // 通用同步分发器（打卡后自动根据当前存储模式同步）
  function autoSyncByStorageMode() {
    if (settings.autoCloudSync !== false && (settings.storageMode === 'cloudflare' || settings.cloudUserId)) {
      syncCloudflareBidirectional(true);
    } else if (settings.storageMode === 'webdav' && settings.webdav && settings.webdav.url) {
      pushToWebDAV(true);
    }
  }

  $('set-wage').addEventListener('change', e => {
    const v = Math.max(0, Math.min(9999, Number(e.target.value) || 0));
    settings.wage = v; e.target.value = v; saveSet(); renderAll();
    Haptic.tick();
  });
  if ($('set-hw-speed')) {
    $('set-hw-speed').addEventListener('change', e => {
      settings.hwSpeed = e.target.value;
      saveSet();
      const ms = HW_SPEED_MS[settings.hwSpeed] || 180;
      if (padInstance && padInstance.setDebounceMs) {
        padInstance.setDebounceMs(ms);
      }
      Haptic.tick();
      toast('已更新手写识别速度');
    });
  }
  if ($('set-celebration')) {
    $('set-celebration').addEventListener('change', e => {
      settings.celebrationFx = e.target.value;
      saveSet();
      Haptic.tick();
      toast('已更新打卡庆祝动效');
    });
  }
  $('set-lunch').addEventListener('change', e => {
    const v = Math.max(0, Math.min(240, Number(e.target.value) || 0));
    settings.lunch = v; e.target.value = v; saveSet(); renderAll();
    Haptic.tick();
  });
  $('set-std').addEventListener('change', e => {
    const v = Math.max(1, Math.min(24, Number(e.target.value) || 8));
    settings.std = v; e.target.value = v; saveSet(); renderAll();
    Haptic.tick();
  });

  $('exp').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'worklog', version: 2, log, settings }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `工时备份-${keyOf(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出备份');
  });

  $('imp').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const data = JSON.parse(rd.result);
        if (!data || typeof data.log !== 'object') throw new Error();
        const n = Object.keys(data.log).length;
        const ok = await window.customConfirm({
          title: '覆盖导入确认',
          message: `导入 ${n} 天打卡记录，会覆盖当前设备上的所有记录，确定要导入吗？`,
          confirmText: '确定覆盖',
          cancelText: '取消',
          isDanger: true
        });
        if (!ok) return;
        log = data.log;
        if (data.settings) settings = Object.assign({ lunch: 60, std: 8, wage: 30, userName: '' }, data.settings);
        saveLog(); saveSet();
        $('set-wage').value = settings.wage; $('set-lunch').value = settings.lunch; $('set-std').value = settings.std;
        renderAll(); toast(`已导入 ${n} 天记录`);
      } catch { toast('文件格式不对，没有导入'); }
      finally { e.target.value = ''; }
    };
    rd.readAsText(f);
  });

  // ---------- 工时小票结算与多格式导出中心控制器 ----------
  let currentExportReport = null;

  function openExportModal() {
    $('export-modal').hidden = false;
    $('em-wage-input').value = settings.wage != null ? settings.wage : 30;
    $('em-name-input').value = settings.userName || '';
    if ($('em-theme-select')) $('em-theme-select').value = settings.exportTheme || 'receipt';
    refreshExportPreview();
  }

  function closeExportModal() {
    animateClose($('export-modal'), 200);
  }

  function refreshExportPreview() {
    const wage = Number($('em-wage-input').value) || 0;
    const name = $('em-name-input').value.trim();
    const themeId = ($('em-theme-select') && $('em-theme-select').value) || 'receipt';

    if (!window.SalaryExporter) return;
    currentExportReport = window.SalaryExporter.computeMonthReportData(statMonth, log, settings, wage, name);

    $('em-sub-period').textContent = `${currentExportReport.year}年${currentExportReport.month}月核算 · 共 ${currentExportReport.attendedDays} 天出勤`;
    renderReportPreview(currentExportReport, themeId);
  }

  // 1. 热敏收银小票实时预览
  function renderReceiptPaper(rep) {
    const box = $('receipt-paper') || $('invoice-paper');
    if (!box) return;
    box.className = 'receipt-paper';

    const rowsHtml = rep.dailyItems.map(item => `
      <tr class="${item.isWeekend ? 'weekend' : ''}">
        <td>${item.dayStr}</td>
        <td>${item.dayOfWeek.replace('周', '')}</td>
        <td>${item.hasRecord ? `${item.inTime}-${item.outTime}` : item.status}</td>
        <td class="num-r">${item.workedHours > 0 ? item.workedHours.toFixed(1) : '0.0'}</td>
        <td class="num-r salary">${item.daySalary > 0 ? item.daySalary.toFixed(2) : '0.00'}</td>
      </tr>
    `).join('');

    box.innerHTML = `
      <div class="rec-header">
        <div class="rec-title">*** 工时考勤结算小票 ***</div>
        <div class="rec-sub">WORKLOG RECEIPT / CASHIER SETTLEMENT</div>
      </div>

      <div class="rec-dash double"></div>

      <div class="rec-meta">
        <div class="rec-meta-row"><span>单号: ${rep.receiptNo}</span><span>核算: ${rep.userName}</span></div>
        <div class="rec-meta-row"><span>打印: ${rep.printTimeStr}</span><span>单价: ￥${rep.wageRate.toFixed(2)}/h</span></div>
        <div class="rec-meta-row"><span>周期: ${rep.periodStr}</span><span>标准: ${rep.stdHours}小时/日</span></div>
      </div>

      <div class="rec-dash"></div>

      <div class="rec-table-wrap">
        <table class="rec-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>星期</th>
              <th>时段(上班-下班)</th>
              <th class="num-r">工时</th>
              <th class="num-r">小计(元)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div class="rec-dash"></div>

      <div class="rec-summary">
        <div class="rec-summary-row"><span>出勤天数:</span><span>${rep.attendedDays} 天</span></div>
        <div class="rec-summary-row"><span>总计工时:</span><span>${rep.totalHours.toFixed(1)} 小时</span></div>
        <div class="rec-summary-row"><span>日均工时:</span><span>${rep.avgHours.toFixed(1)} 小时</span></div>
        ${rep.overHours > 0 ? `<div class="rec-summary-row"><span>加班工时:</span><span>+${rep.overHours.toFixed(1)} 小时</span></div>` : ''}
        <div class="rec-summary-row" style="margin-top:4px;"><span>实发大写:</span><span>${rep.totalSalaryCn}</span></div>
        <div class="rec-summary-row total-amount">
          <span>实付应发金额 TOTAL:</span>
          <span class="big-price">￥${rep.totalSalary.toFixed(2)}</span>
        </div>
      </div>

      <div class="rec-dash double"></div>

      <div class="rec-footer">
        <div>*** 感谢您的辛勤付出！辛苦了 ***</div>
        <div>请核对打卡工时明细，妥善留存核算小票</div>
        <div class="rec-barcode-mock">
          <i style="width:2px"></i><i style="width:4px"></i><i style="width:1px"></i><i style="width:3px"></i>
          <i style="width:2px"></i><i style="width:1px"></i><i style="width:4px"></i><i style="width:2px"></i>
          <i style="width:3px"></i><i style="width:1px"></i><i style="width:2px"></i><i style="width:4px"></i>
          <i style="width:1px"></i><i style="width:3px"></i><i style="width:2px"></i><i style="width:4px"></i>
          <i style="width:2px"></i><i style="width:3px"></i><i style="width:1px"></i><i style="width:2px"></i>
          <i style="width:4px"></i><i style="width:1px"></i><i style="width:3px"></i><i style="width:2px"></i>
        </div>
        <div class="rec-barcode-txt">* ${rep.receiptNo} *</div>
      </div>
    `;
  }

  // 2. 复古打卡工卡实时预览
  function renderTimecardPaper(rep) {
    const box = $('receipt-paper') || $('invoice-paper');
    if (!box) return;
    box.className = 'timecard-paper';

    const rowsHtml = rep.dailyItems.map(item => `
      <tr>
        <td>${String(item.dayNum).padStart(2, '0')}</td>
        <td>${item.dayOfWeek.replace('周', '')}</td>
        <td class="in-time">${item.hasRecord ? item.inTime : '--:--'}</td>
        <td class="out-time ${item.status === '超时加班' ? 'over' : ''}">${item.hasRecord ? item.outTime : '--:--'}</td>
        <td>${item.hasRecord ? `${item.lunchSpan}m` : '--'}</td>
        <td class="work-h ${item.status === '超时加班' ? 'over' : ''}">${item.workedHours > 0 ? item.workedHours.toFixed(1) + 'h' : '0.0h'}</td>
        <td style="color:${item.hasRecord ? '#15803d' : '#9ca3af'};">${item.hasRecord ? '已核' : '--'}</td>
      </tr>
    `).join('');

    box.innerHTML = `
      <div class="tc-slot"></div>
      <div class="tc-header">
        <div class="tc-title">月 度 职 工 考 勤 打 卡 卡 片</div>
        <div class="tc-sub">TIME RECORDER CARD · STANDARD PUNCH RECORD</div>
        <div class="tc-meta">
          <div>卡号: TC-${rep.year}${String(rep.month).padStart(2, '0')}-${rep.attendedDays}</div>
          <div style="text-align:right">姓名: ${rep.userName}</div>
          <div>月份: ${rep.year}年${rep.month}月</div>
          <div style="text-align:right">计薪标准: ￥${rep.wageRate.toFixed(2)}/h</div>
        </div>
      </div>

      <table class="tc-table">
        <thead>
          <tr>
            <th style="width:24px;">日</th>
            <th style="width:28px;">星期</th>
            <th>上午 签到</th>
            <th>下午 签退</th>
            <th>扣午休</th>
            <th>实计工时</th>
            <th>核验</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="tc-summary-box">
        <div>
          <div style="font-size:12px;font-weight:700;">出勤: ${rep.attendedDays} 天 · 工时: ${rep.totalHours.toFixed(1)} 小时</div>
          <div style="font-size:11px;color:#78350f;margin-top:2px;">大写: ${rep.totalSalaryCn}</div>
        </div>
        <div class="tc-sum-amount">￥${rep.totalSalary.toFixed(2)}</div>
      </div>

      <div class="tc-signs">
        <div>持卡职工签名 (确认): ________________</div>
        <div>车间核签盖章: ________________</div>
      </div>
    `;
  }

  // 3. 现代极简报表实时预览
  function renderStatementPaper(rep) {
    const box = $('receipt-paper') || $('invoice-paper');
    if (!box) return;
    box.className = 'statement-paper';

    const rowsHtml = rep.dailyItems.map(item => `
      <tr>
        <td><strong>${item.dayStr}</strong></td>
        <td>${item.dayOfWeek}</td>
        <td>${item.hasRecord ? `${item.inTime} - ${item.outTime}` : '--'}</td>
        <td style="text-align:right;font-weight:700;">${item.workedHours > 0 ? item.workedHours.toFixed(1) + 'h' : '--'}</td>
        <td style="text-align:right;font-weight:700;">${item.daySalary > 0 ? '￥' + item.daySalary.toFixed(2) : '--'}</td>
        <td style="text-align:center;">
          <span class="stmt-badge ${item.hasRecord ? (item.status === '超时加班' ? 'amber' : 'green') : 'gray'}">
            ${item.status}
          </span>
        </td>
      </tr>
    `).join('');

    box.innerHTML = `
      <div class="stmt-head">
        <div>
          <div class="stmt-title">月度工时与报酬结算报告</div>
          <div style="font-size:11.5px;color:#64748b;margin-top:2px;">PERIOD: ${rep.periodStr}</div>
        </div>
        <div class="stmt-serial">
          <div>单号: STMT-${rep.year}${String(rep.month).padStart(2, '0')}-${rep.attendedDays}</div>
          <div>${rep.printTimeStr}</div>
        </div>
      </div>

      <div class="stmt-bento">
        <div class="stmt-card">
          <div style="font-size:11px;color:#64748b;font-weight:700;">当月应付总报酬 TOTAL</div>
          <div class="stmt-big-num">￥${rep.totalSalary.toFixed(2)}</div>
          <div style="font-size:10.5px;color:#64748b;">${rep.totalSalaryCn}</div>
        </div>
        <div class="stmt-card" style="display:flex;flex-direction:column;justify-content:center;gap:3px;font-size:11px;">
          <div><strong>核算对象:</strong> ${rep.userName}</div>
          <div><strong>计薪标准:</strong> ￥${rep.wageRate.toFixed(2)} /小时</div>
          <div><strong>有效出勤:</strong> ${rep.attendedDays} 天 (${rep.totalHours.toFixed(1)} 小时)</div>
          <div><strong>日均工时:</strong> ${rep.avgHours.toFixed(1)} 小时 · 加班: ${rep.overHours.toFixed(1)}h</div>
        </div>
      </div>

      <table class="stmt-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>星期</th>
            <th>上下班时段</th>
            <th style="text-align:right;">计入工时</th>
            <th style="text-align:right;">当日结算</th>
            <th style="text-align:center;">状态</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  // 4. 日历热力手账实时预览
  function renderCalendarPaper(rep) {
    const box = $('receipt-paper') || $('invoice-paper');
    if (!box) return;
    box.className = 'calendar-paper';

    const dayMap = {};
    rep.dailyItems.forEach(it => dayMap[it.dayNum] = it);

    let cellsHtml = '';
    for (let c = 0; c < rep.firstDayWeekIndex; c++) {
      cellsHtml += `<div class="cal-cell empty"></div>`;
    }

    for (let day = 1; day <= rep.daysInMonth; day++) {
      const it = dayMap[day];
      const workedClass = it && it.hasRecord ? (it.workedHours >= rep.stdHours ? 'worked' : 'half') : '';
      cellsHtml += `
        <div class="cal-cell ${workedClass}">
          <span class="cal-cell-d">${day}</span>
          <span class="cal-cell-h">${it && it.hasRecord ? it.workedHours.toFixed(1) + 'h' : '--'}</span>
          <span class="cal-cell-sal">${it && it.hasRecord ? '￥' + Math.round(it.daySalary) : ''}</span>
        </div>
      `;
    }

    box.innerHTML = `
      <div class="cal-title-wrap">
        <div class="cal-title">${rep.year}年${rep.month}月 出勤与工时手账</div>
        <div class="cal-sub">核算对象: ${rep.userName} · 时薪标准: ￥${rep.wageRate.toFixed(2)}/h · 标准日工时: ${rep.stdHours}h</div>
      </div>

      <div class="cal-grid">
        <div class="cal-w-head weekend">日</div>
        <div class="cal-w-head">一</div>
        <div class="cal-w-head">二</div>
        <div class="cal-w-head">三</div>
        <div class="cal-w-head">四</div>
        <div class="cal-w-head">五</div>
        <div class="cal-w-head weekend">六</div>
        ${cellsHtml}
      </div>

      <div class="cal-stat-bar">
        <div>
          <div style="font-size:12px;color:#64748b;font-weight:700;">月度实核总金额</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">${rep.totalSalaryCn} · 出勤 ${rep.attendedDays} 天 (${rep.totalHours.toFixed(1)}h)</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px;font-weight:900;color:#b91c1c;">￥${rep.totalSalary.toFixed(2)}</div>
          <div style="font-size:10px;color:#15803d;font-weight:700;">日均 ${rep.avgHours.toFixed(1)} 小时</div>
        </div>
      </div>
    `;
  }

  // 5. 胶带记账便签实时预览
  function renderMemoPaper(rep) {
    const box = $('receipt-paper') || $('invoice-paper');
    if (!box) return;
    box.className = 'memo-paper';

    const itemsHtml = rep.dailyItems.map(item => `
      <div class="memo-item ${item.hasRecord ? '' : 'off'}">
        <span>${item.hasRecord ? '[出勤]' : '[未卡]'} ${item.dayStr} ${item.dayOfWeek}</span>
        <span>${item.hasRecord ? `${item.inTime}-${item.outTime}` : item.status}</span>
        <span style="font-weight:700;">${item.hasRecord ? `${item.workedHours.toFixed(1)}h · ￥${item.daySalary.toFixed(2)}` : '--'}</span>
      </div>
    `).join('');

    box.innerHTML = `
      <div class="memo-tape"></div>
      <div class="memo-title">${rep.month}月工时结算备忘便笺</div>
      <div class="memo-sub">记账人: ${rep.userName} · 时薪: ￥${rep.wageRate.toFixed(2)}/h · 出勤: ${rep.attendedDays}天</div>

      <div class="memo-list">
        ${itemsHtml}
      </div>

      <div class="memo-highlight-box">
        <div>
          <div style="font-size:12px;font-weight:800;color:#78350f;">当月结算实收 (${rep.attendedDays}天 / ${rep.totalHours.toFixed(1)}h)</div>
          <div style="font-size:10.5px;color:#92400e;margin-top:2px;">大写: ${rep.totalSalaryCn}</div>
        </div>
        <div style="font-size:20px;font-weight:900;color:#b91c1c;">￥${rep.totalSalary.toFixed(2)}</div>
      </div>

      <div class="memo-stamp">记得按时核对结算，辛劳一个月，好好犒劳自己！</div>
    `;
  }

  // 多版式通用调度器
  function renderReportPreview(rep, themeId = 'receipt') {
    switch (themeId) {
      case 'timecard':
        renderTimecardPaper(rep);
        break;
      case 'statement':
        renderStatementPaper(rep);
        break;
      case 'calendar':
        renderCalendarPaper(rep);
        break;
      case 'memo':
        renderMemoPaper(rep);
        break;
      case 'receipt':
      default:
        renderReceiptPaper(rep);
        break;
    }
  }

  // 保持别名兼容
  const renderInvoicePaper = renderReceiptPaper;

  // 绑定导出中心交互事件
  $('btn-open-export').addEventListener('click', openExportModal);
  $('em-close').addEventListener('click', closeExportModal);

  $('em-wage-input').addEventListener('input', () => {
    const v = Number($('em-wage-input').value) || 0;
    settings.wage = v;
    saveSet();
    refreshExportPreview();
    renderStats();
  });

  $('em-name-input').addEventListener('input', () => {
    settings.userName = $('em-name-input').value.trim();
    saveSet();
    refreshExportPreview();
  });

  if ($('em-theme-select')) {
    $('em-theme-select').addEventListener('change', () => {
      settings.exportTheme = $('em-theme-select').value;
      saveSet();
      refreshExportPreview();
    });
  }

  // 保存所选版式高清长图
  $('btn-export-image').addEventListener('click', async () => {
    if (!currentExportReport || !window.SalaryExporter) return;
    const themeId = ($('em-theme-select') && $('em-theme-select').value) || 'receipt';
    const theme = window.SalaryExporter.ThemeRegistry[themeId] || window.SalaryExporter.ThemeRegistry.receipt;
    const themeLabel = theme ? theme.name.split('（')[0] : '核算';
    toast(`正在生成${themeLabel}长图...`);
    const ok = await window.SalaryExporter.exportLongImage(currentExportReport, themeId);
    if (ok) toast(`已保存${themeLabel}长图`);
    else toast('图片生成失败，请重试');
  });

  // 导出明细表格
  $('btn-export-excel').addEventListener('click', () => {
    if (!currentExportReport || !window.SalaryExporter) return;
    window.SalaryExporter.exportExcelCsv(currentExportReport);
    toast('已导出明细表格');
  });

  // ---------- 长辈手写三步向导控制器（方案 A：分格引导 + 离线神经网络） ----------
  let padInstance = null;
  let wizKey = null;
  let wizStep = 1; // 1: 上班, 2: 下班, 3: 休息
  let isKeypadMode = false;
  let wizData = { in: '', out: '', lunchSpan: 60, lunchStart: '12:00', lunchEnd: '13:00' };

  let currentGridIdx = 0; // 0: 时十位, 1: 时个位, 2: 分十位, 3: 分个位
  let currentGridDigits = ['', '', '', ''];
  let autoAdvanceTimer = null;
  const gridTipTexts = [
    '请书写：时 十位（0、1 或 2）',
    '请书写：时 个位（0 到 9，20点后为 0 到 3）',
    '请书写：分 十位（0 到 5，不能达到 60 分）',
    '请书写：分 个位（0 到 9）'
  ];

  function isValidTimeStr(str) {
    if (!str || !/^\d{2}:\d{2}$/.test(str)) return false;
    const [hh, mm] = str.split(':').map(Number);
    return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
  }

  // 严格单格时间合法性校验
  function validateGridDigit(idx, char, currentDigits) {
    if (!/^\d$/.test(char)) return { valid: false, reason: '请输入 0 到 9 的纯数字' };
    const num = Number(char);
    if (idx === 0) {
      if (num > 2) {
        return { valid: false, reason: '小时十位只能是 0、1 或 2（一天为 00~23 小时）' };
      }
    } else if (idx === 1) {
      const d0 = currentDigits[0];
      if (d0 === '2' && num > 3) {
        return { valid: false, reason: '小时不能超过 23（时十位为2时，个位只能是 0 到 3）' };
      }
    } else if (idx === 2) {
      if (num > 5) {
        return { valid: false, reason: '分钟十位只能是 0 到 5（一小时最多 59 分钟）' };
      }
    } else if (idx === 3) {
      return { valid: true };
    }
    return { valid: true };
  }

  function trySetGridDigit(idx, char) {
    const check = validateGridDigit(idx, char, currentGridDigits);
    if (!check.valid) {
      Haptic.warning();
      toast(check.reason);
      if (padInstance) padInstance.clear();
      return false;
    }
    currentGridDigits[idx] = String(char);
    if (idx === 0 && char === '2' && Number(currentGridDigits[1]) > 3) {
      currentGridDigits[1] = '';
    }
    updateGridUI();
    return true;
  }

  function getStrokesBBox(strokes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const st of strokes) {
      for (const p of st) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return {
      minX, minY, maxX, maxY,
      w: Math.max(maxX - minX, 1),
      h: Math.max(maxY - minY, 1)
    };
  }

  function updateGridUI() {
    for (let i = 0; i < 4; i++) {
      const cell = $(`wiz-cell-${i}`);
      const digitTxt = $(`wiz-gd-${i}`);
      if (!cell || !digitTxt) continue;
      cell.classList.toggle('active', i === currentGridIdx);
      cell.classList.toggle('filled', currentGridDigits[i] !== '');
      digitTxt.textContent = currentGridDigits[i] !== '' ? currentGridDigits[i] : '-';
    }

    const h = (currentGridDigits[0] || '-') + (currentGridDigits[1] || '-');
    const m = (currentGridDigits[2] || '-') + (currentGridDigits[3] || '-');
    const isFull = Boolean(currentGridDigits[0] && currentGridDigits[1] && currentGridDigits[2] && currentGridDigits[3]);
    const fullTime = isFull ? `${currentGridDigits[0]}${currentGridDigits[1]}:${currentGridDigits[2]}${currentGridDigits[3]}` : '';

    setStepTime(fullTime);
    $('wiz-echo-val').textContent = `${h}:${m}`;

    const hint = $('wiz-pad-hint');
    if (hint) {
      hint.textContent = gridTipTexts[currentGridIdx] || '请在此书写当前数字';
    }
  }

  function syncTimeToGrid(timeStr) {
    if (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr)) {
      const parts = timeStr.split(':');
      const hh = parts[0].padStart(2, '0');
      const mm = parts[1];
      currentGridDigits = [hh[0], hh[1], mm[0], mm[1]];
      currentGridIdx = 0;
    } else {
      currentGridDigits = ['', '', '', ''];
      currentGridIdx = 0;
    }
    updateGridUI();
  }

  function initPad() {
    if (padInstance) return;
    const canvas = $('wiz-canvas');
    if (!canvas || !window.HandwritingPad) return;

    const curSpeedMs = HW_SPEED_MS[settings.hwSpeed || 'fast'] || 180;

    padInstance = new window.HandwritingPad(canvas, strokes => {
      if (!strokes || strokes.length === 0) {
        $('wiz-pad-hint').hidden = false;
        return;
      }
      $('wiz-pad-hint').hidden = true;

      let rawRes = null;
      // 优先极速通道（毫秒级单字识别）
      if (window.recognizeSingleDigit) {
        rawRes = window.recognizeSingleDigit(strokes);
      } else if (window.NNEngine && window.NNEngine.isReady) {
        const box = getStrokesBBox(strokes);
        const input784 = window.NNEngine.preprocessStrokes(strokes, box);
        rawRes = window.NNEngine.predict(input784);
      } else if (window.recognizeStrokes) {
        rawRes = window.recognizeStrokes(strokes, { step: wizStep === 2 ? 'out' : 'in' });
      }

      // 严格解包：彻底消灭 [object Object] 报错
      let digit = '';
      if (rawRes) {
        if (typeof rawRes === 'string') {
          digit = rawRes;
        } else if (typeof rawRes === 'object') {
          digit = rawRes.char || rawRes.digit || (rawRes.primaryTime ? rawRes.primaryTime.replace(/\D/g, '').slice(-1) : '');
        }
      }
      digit = String(digit || '').trim();
      const match = digit.match(/\d/);
      digit = match ? match[0] : '';

      if (digit !== '') {
        const ok = trySetGridDigit(currentGridIdx, digit);
        if (ok) {
          clearTimeout(autoAdvanceTimer);
          const advanceMs = settings.hwSpeed === 'instant' ? 180 : (settings.hwSpeed === 'relaxed' ? 380 : 260);
          autoAdvanceTimer = setTimeout(() => {
            if (currentGridIdx < 3) {
              currentGridIdx++;
              updateGridUI();
              if (padInstance) padInstance.clear();
              const hint = $('wiz-pad-hint');
              if (hint) hint.hidden = false;
            }
          }, advanceMs);
        }
      }
    }, { debounceMs: curSpeedMs });

    padInstance.onStrokeStart = () => {
      $('wiz-pad-hint').hidden = true;
      clearTimeout(autoAdvanceTimer);
    };

    // 绑定格子直接点击选择
    document.querySelectorAll('.wiz-grid-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        clearTimeout(autoAdvanceTimer);
        currentGridIdx = Number(cell.dataset.idx);
        updateGridUI();
        if (padInstance) padInstance.clear();
        const hint = $('wiz-pad-hint');
        if (hint) hint.hidden = false;
      });
    });

    // 绑定工具栏操作
    $('wiz-clear-cell-btn').addEventListener('click', () => {
      clearTimeout(autoAdvanceTimer);
      currentGridDigits[currentGridIdx] = '';
      updateGridUI();
      if (padInstance) padInstance.clear();
      const hint = $('wiz-pad-hint');
      if (hint) hint.hidden = false;
    });

    $('wiz-clear-all-btn').addEventListener('click', () => {
      clearTimeout(autoAdvanceTimer);
      currentGridDigits = ['', '', '', ''];
      currentGridIdx = 0;
      updateGridUI();
      if (padInstance) padInstance.clear();
      const hint = $('wiz-pad-hint');
      if (hint) hint.hidden = false;
    });

    $('wiz-next-cell-btn').addEventListener('click', () => {
      clearTimeout(autoAdvanceTimer);
      if (currentGridIdx < 3) {
        currentGridIdx++;
        updateGridUI();
        if (padInstance) padInstance.clear();
        const hint = $('wiz-pad-hint');
        if (hint) hint.hidden = false;
      }
    });
  }

  function setStepTime(val) {
    if (wizStep === 1) wizData.in = val;
    else if (wizStep === 2) wizData.out = val;
  }

  function getStepTime() {
    return wizStep === 1 ? wizData.in : wizData.out;
  }

  function renderCandidates(candidates) {
    const wrap = $('wiz-candidates');
    if (!wrap) return;
    if (!candidates || !candidates.length) {
      wrap.innerHTML = '';
      return;
    }
    const curVal = getStepTime();
    wrap.innerHTML = candidates.map(c => `
      <button type="button" class="wiz-cand-pill ${c === curVal ? 'on' : ''}" data-val="${c}">${c}</button>
    `).join('');
  }

  $('wiz-candidates').addEventListener('click', e => {
    const b = e.target.closest('.wiz-cand-pill');
    if (!b) return;
    clearTimeout(autoAdvanceTimer);
    const val = b.dataset.val;
    syncTimeToGrid(val);
    document.querySelectorAll('.wiz-cand-pill').forEach(x => x.classList.toggle('on', x === b));
  });

  // 键盘与手写板切换
  $('wiz-toggle-keypad').addEventListener('click', () => {
    isKeypadMode = !isKeypadMode;
    $('wiz-keypad').hidden = !isKeypadMode;
    $('wiz-pad-container').style.display = isKeypadMode ? 'none' : '';
    $('wiz-toggle-keypad').textContent = isKeypadMode ? '手写输入' : '切换键盘';
  });

  // 备用数字键盘输入 (带单格合法性拦截)
  $('wiz-keypad').addEventListener('click', e => {
    const b = e.target.closest('button[data-key]');
    if (!b) return;
    clearTimeout(autoAdvanceTimer);
    const k = b.dataset.key;
    if (k === 'del') {
      currentGridDigits[currentGridIdx] = '';
      updateGridUI();
      if (currentGridIdx > 0) {
        currentGridIdx--;
        updateGridUI();
      }
    } else if (k === ':') {
      if (currentGridIdx < 2) currentGridIdx = 2;
      updateGridUI();
    } else if (/^\d$/.test(k)) {
      const ok = trySetGridDigit(currentGridIdx, k);
      if (ok && currentGridIdx < 3) {
        currentGridIdx++;
        updateGridUI();
      }
    }
  });

  // 通用时间跨度计算函数 (跨天自适应，以分钟为单位)
  function calcMinutesBetween(startStr, endStr) {
    if (!startStr || !endStr) return 0;
    let s = toMin(startStr);
    let e = toMin(endStr);
    let diff = e - s;
    if (diff < 0) diff += 1440;
    return diff;
  }

  // 休息时长预设选择 (双向联动具体时间段)
  $('wiz-rest-presets').addEventListener('click', e => {
    const b = e.target.closest('.preset-btn');
    if (!b) return;
    const targetMin = Number(b.dataset.min);
    wizData.lunchSpan = targetMin;
    document.querySelectorAll('#wiz-rest-presets .preset-btn').forEach(x => x.classList.toggle('on', x === b));

    let curStart = $('wiz-rest-start').value || '12:00';
    if (targetMin === 0) {
      $('wiz-rest-end').value = curStart;
      wizData.lunchStart = curStart;
      wizData.lunchEnd = curStart;
    } else {
      let endM = toMin(curStart) + targetMin;
      if (endM >= 1440) endM %= 1440;
      const endStr = `${pad(Math.floor(endM / 60))}:${pad(endM % 60)}`;
      $('wiz-rest-end').value = endStr;
      wizData.lunchStart = curStart;
      wizData.lunchEnd = endStr;
    }
  });

  function onWizRestTimeInputsChange() {
    const s = $('wiz-rest-start').value;
    const e = $('wiz-rest-end').value;
    if (s && e) {
      const span = calcMinutesBetween(s, e);
      wizData.lunchSpan = span;
      wizData.lunchStart = s;
      wizData.lunchEnd = e;
      document.querySelectorAll('#wiz-rest-presets .preset-btn').forEach(btn => {
        btn.classList.toggle('on', Number(btn.dataset.min) === span);
      });
    }
  }

  $('wiz-rest-start').addEventListener('change', onWizRestTimeInputsChange);
  $('wiz-rest-end').addEventListener('change', onWizRestTimeInputsChange);
  $('wiz-rest-start').addEventListener('input', onWizRestTimeInputsChange);
  $('wiz-rest-end').addEventListener('input', onWizRestTimeInputsChange);

  function openWizard(key, startStep = 1) {
    wizKey = key || activeKey();
    const r = log[wizKey] || {};
    wizData.in = r.in || '';
    wizData.out = r.out || '';
    wizData.lunchSpan = (r.lunch != null ? r.lunch : settings.lunch || 60);
    wizData.lunchStart = r.lunchStart || (settings.routineLunch ? settings.routineLunch.start : '12:00');
    wizData.lunchEnd = r.lunchEnd || (settings.routineLunch ? settings.routineLunch.end : '13:00');

    // 若当前编辑的这天已有记录，展示顶部红色删除按钮
    const delBtn = $('wiz-del-btn');
    if (delBtn) {
      delBtn.hidden = !(r.in || r.out);
    }

    $('wizard-modal').hidden = false;
    initPad();

    setTimeout(() => {
      if (padInstance) padInstance.resize();
      gotoStep(startStep);
    }, 50);
  }

  function closeWizard() {
    clearTimeout(autoAdvanceTimer);
    animateClose($('wizard-modal'), 200);
    wizKey = null;
  }

  // 向导内快捷删除已有记录
  const wizDelBtn = $('wiz-del-btn');
  if (wizDelBtn) {
    wizDelBtn.addEventListener('click', async () => {
      if (!wizKey) return;
      const ok = await window.customConfirm({
        title: '删除打卡记录',
        message: `确定要删除 ${wizKey} 的打卡记录吗？`,
        confirmText: '删除记录',
        cancelText: '取消',
        isDanger: true
      });
      if (ok) {
        delete log[wizKey];
        saveLog();
        closeWizard();
        Haptic.warning();
        renderAll();
        toast('已删除该日记录');
        autoSyncByStorageMode();
      }
    });
  }

  function gotoStep(step) {
    clearTimeout(autoAdvanceTimer);
    wizStep = step;
    const d = dateOf(wizKey);
    $('wiz-target-date').textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${WD[d.getDay()]}`;

    isKeypadMode = false;
    $('wiz-keypad').hidden = true;
    $('wiz-pad-container').style.display = '';
    $('wiz-toggle-keypad').textContent = '切换键盘';
    if (padInstance) padInstance.clear();

    if (step === 1) {
      $('wiz-step-pill').textContent = '第 1 步 / 共 3 步 · 上班';
      $('wiz-title').textContent = '您几点上班？';
      $('wiz-step-time').hidden = false;
      $('wiz-step-rest').hidden = true;
      $('wiz-prev-btn').hidden = true;
      $('wiz-next-btn').textContent = '对，下一步';
      syncTimeToGrid(wizData.in || '');
      renderCandidates(wizData.in ? [wizData.in] : ['08:00', '08:30', '09:00']);
    } else if (step === 2) {
      $('wiz-step-pill').textContent = '第 2 步 / 共 3 步 · 下班';
      $('wiz-title').textContent = '您几点下班？';
      $('wiz-step-time').hidden = false;
      $('wiz-step-rest').hidden = true;
      $('wiz-prev-btn').hidden = false;
      $('wiz-next-btn').textContent = '对，下一步';
      syncTimeToGrid(wizData.out || '');
      renderCandidates(wizData.out ? [wizData.out] : ['17:30', '18:00', '18:30']);
    } else if (step === 3) {
      $('wiz-step-pill').textContent = '第 3 步 / 共 3 步 · 休息';
      $('wiz-title').textContent = '中午休息多久？';
      $('wiz-step-time').hidden = true;
      $('wiz-step-rest').hidden = false;
      $('wiz-prev-btn').hidden = false;
      $('wiz-next-btn').textContent = '完成记录';

      // 智能常用午休卡片：动态基于时间段计算实际扣除小时数，杜绝计算误差
      const routine = settings.routineLunch;
      if (routine && (routine.span || (routine.start && routine.end))) {
        $('wiz-routine-card').hidden = false;
        const rStart = routine.start || '12:00';
        const rEnd = routine.end || '13:00';
        const realSpan = calcMinutesBetween(rStart, rEnd);
        const displaySpan = realSpan > 0 ? realSpan : (routine.span || 60);
        const hStr = fmtH(displaySpan);
        $('rc-time-txt').textContent = `${rStart} – ${rEnd}（扣除 ${hStr} 小时）`;
        $('rc-use-btn').onclick = () => {
          wizData.lunchSpan = displaySpan;
          wizData.lunchStart = rStart;
          wizData.lunchEnd = rEnd;
          $('wiz-rest-start').value = rStart;
          $('wiz-rest-end').value = rEnd;
          saveAndFinishWizard();
        };
      } else {
        $('wiz-routine-card').hidden = true;
      }

      // 高亮对应预设
      document.querySelectorAll('#wiz-rest-presets .preset-btn').forEach(btn => {
        btn.classList.toggle('on', Number(btn.dataset.min) === wizData.lunchSpan);
      });

      $('wiz-rest-start').value = wizData.lunchStart || '12:00';
      $('wiz-rest-end').value = wizData.lunchEnd || '13:00';
    }
  }

  function saveAndFinishWizard() {
    if (!wizData.in) {
      toast('请先输入上班时间');
      gotoStep(1);
      return;
    }
    if (!isValidTimeStr(wizData.in)) {
      toast('上班时间不合法，小时需00~23，分钟需00~59');
      gotoStep(1);
      return;
    }
    if (!wizData.out) {
      toast('请先输入下班时间');
      gotoStep(2);
      return;
    }
    if (!isValidTimeStr(wizData.out)) {
      toast('下班时间不合法，小时需00~23，分钟需00~59');
      gotoStep(2);
      return;
    }

    const r = log[wizKey] || (log[wizKey] = {});
    r.in = wizData.in;
    r.out = wizData.out;
    r.lunch = wizData.lunchSpan != null ? wizData.lunchSpan : settings.lunch;
    r.lunchStart = $('wiz-rest-start').value;
    r.lunchEnd = $('wiz-rest-end').value;

    // 记忆平时的常用午休
    if ($('wiz-save-routine').checked && r.lunch > 0) {
      settings.routineLunch = {
        start: r.lunchStart,
        end: r.lunchEnd,
        span: r.lunch
      };
      saveSet();
    }

    saveLog();
    closeWizard();
    renderAll();
    toast(`工时已记录：${fmtH(worked(r))} 小时`);
    autoSyncByStorageMode();
  }

  // 向导下一步与上一步 (带格式与范围校验)
  $('wiz-next-btn').addEventListener('click', () => {
    if (padInstance && padInstance.flush) padInstance.flush();
    clearTimeout(autoAdvanceTimer);
    if (wizStep === 1) {
      const v = getStepTime();
      if (!v || v === '--:--' || v.length < 5) {
        toast('请先将上方 4 个格子书写完整');
        return;
      }
      if (!isValidTimeStr(v)) {
        toast('上班时间不合法：小时需在 00~23 之间，分钟需在 00~59 之间');
        return;
      }
      gotoStep(2);
    } else if (wizStep === 2) {
      const v = getStepTime();
      if (!v || v === '--:--' || v.length < 5) {
        toast('请先将上方 4 个格子书写完整');
        return;
      }
      if (!isValidTimeStr(v)) {
        toast('下班时间不合法：小时需在 00~23 之间，分钟需在 00~59 之间');
        return;
      }
      gotoStep(3);
    } else if (wizStep === 3) {
      saveAndFinishWizard();
    }
  });

  $('wiz-prev-btn').addEventListener('click', () => {
    if (wizStep > 1) gotoStep(wizStep - 1);
  });

  $('wiz-close').addEventListener('click', closeWizard);

  // ---------- 经典黑色大按钮 · 内嵌充能光轨打卡控制器 ----------
  const LONG_PRESS_DURATION = 800; // 毫秒平滑充满

  let isPressingPunch = false;
  let pressStartTime = 0;
  let punchAnimFrame = null;
  let hasTriggeredPunch = false;

  const quickPunchBtn = $('btn-quick-punch');
  const chargeFill = $('btn-charge-fill');
  const chargeGlow = $('btn-charge-glow');
  const chargePct = $('hero-charge-pct');
  const statePill = $('m3-btn-state-pill');

  function startPunchProgress(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (hasTriggeredPunch) return;

    // 当天已完成打卡，严格拦截长按重复打卡
    const k = activeKey();
    const r = log[k] || {};
    const hasRecorded = !!(r.in && r.out);
    if (hasRecorded) {
      Haptic.warning();
      toast('今日已完成打卡，如需调整工时请点击下方“微调今日工时”');
      return;
    }

    isPressingPunch = true;
    pressStartTime = performance.now();
    if (quickPunchBtn) quickPunchBtn.classList.add('charging');
    if (navigator.vibrate) navigator.vibrate(20);

    const updateCharge = now => {
      if (!isPressingPunch) return;
      const elapsed = now - pressStartTime;
      const progress = Math.min(1.0, elapsed / LONG_PRESS_DURATION);
      const pct = Math.round(progress * 100);

      if (chargeFill) {
        chargeFill.style.width = `${progress * 100}%`;
        chargeFill.style.background = 'linear-gradient(90deg, #ea580c 0%, #ff5b2e 100%)';
      }
      if (chargeGlow) {
        chargeGlow.style.opacity = progress > 0 ? '1' : '0';
        chargeGlow.style.left = `calc(${progress * 100}% - 8px)`;
        chargeGlow.style.boxShadow = '0 0 16px rgba(255, 91, 46, 0.85)';
      }
      if (quickPunchBtn) {
        quickPunchBtn.style.boxShadow = `0 0 ${16 + progress * 10}px rgba(255, 91, 46, ${0.35 + progress * 0.15})`;
      }
      if (chargePct) {
        chargePct.hidden = false;
        chargePct.textContent = `${pct}%`;
        chargePct.style.color = '#ff5b2e';
      }
      const titleTxt = $('m3-btn-title');
      if (titleTxt) {
        titleTxt.textContent = `正在记录 ${pct}%`;
      }

      if (progress >= 1.0) {
        // 完成打卡
        isPressingPunch = false;
        hasTriggeredPunch = true;
        finishQuickPunch();
      } else {
        punchAnimFrame = requestAnimationFrame(updateCharge);
      }
    };

    punchAnimFrame = requestAnimationFrame(updateCharge);
  }

  function cancelPunchProgress() {
    if (!isPressingPunch) return;
    isPressingPunch = false;
    cancelAnimationFrame(punchAnimFrame);
    if (quickPunchBtn) {
      quickPunchBtn.classList.remove('charging');
      quickPunchBtn.style.boxShadow = '';
    }

    // 平滑回弹退回 0%
    if (chargeFill) {
      chargeFill.style.transition = 'width 0.22s var(--m3-easing-emphasized)';
      chargeFill.style.width = '0%';
      setTimeout(() => {
        if (chargeFill) {
          chargeFill.style.transition = 'none';
          chargeFill.style.background = '';
        }
      }, 240);
    }
    if (chargeGlow) {
      chargeGlow.style.opacity = '0';
      chargeGlow.style.boxShadow = '';
    }
    if (chargePct) {
      chargePct.hidden = true;
      chargePct.style.color = '';
    }

    const k = activeKey();
    const r = log[k] || {};
    const hasRecorded = !!(r.in && r.out);
    const durMin = hasRecorded ? worked(r) : 0;
    const titleTxt = $('m3-btn-title');
    if (titleTxt) {
      titleTxt.textContent = hasRecorded ? `已打卡 · ${fmtH(durMin)} 小时` : '长按打卡';
    }
  }

  function finishQuickPunch() {
    if (quickPunchBtn) {
      quickPunchBtn.classList.remove('charging');
      quickPunchBtn.style.boxShadow = '';
      quickPunchBtn.classList.add('pop');
      setTimeout(() => {
        if (quickPunchBtn) quickPunchBtn.classList.remove('pop');
      }, 460);
    }
    if (chargeFill) {
      chargeFill.style.background = '';
    }
    if (chargeGlow) {
      chargeGlow.style.boxShadow = '';
    }
    if (chargePct) {
      chargePct.style.color = '';
    }
    const k = activeKey();
    const r = log[k] || (log[k] = {});

    const defaultIn = settings.routineIn || '08:30';
    const defaultOut = settings.routineOut || '17:30';
    const defaultLunch = (settings.routineLunch && settings.routineLunch.span) ? settings.routineLunch.span : (settings.lunch || 60);

    r.in = defaultIn;
    r.out = defaultOut;
    r.lunch = defaultLunch;

    saveLog();
    if (navigator.vibrate) navigator.vibrate([28, 38, 48]);

    renderAll();

    // 触发庆祝动效（彩礼烟花 / 金钞飘落）
    const fxType = settings.celebrationFx || 'confetti';
    if (window.CelebrationFX && fxType !== 'none') {
      window.CelebrationFX.celebrate(fxType);
    }

    const durH = fmtH(worked(r));
    toast(`已打卡 · ${durH} 小时`);
    autoSyncByStorageMode();

    setTimeout(() => {
      hasTriggeredPunch = false;
    }, 600);
  }

  if (quickPunchBtn) {
    quickPunchBtn.addEventListener('pointerdown', startPunchProgress);
    quickPunchBtn.addEventListener('pointerup', cancelPunchProgress);
    quickPunchBtn.addEventListener('pointerleave', cancelPunchProgress);
    quickPunchBtn.addEventListener('pointercancel', cancelPunchProgress);
    quickPunchBtn.addEventListener('click', () => {
      const k = activeKey();
      const r = log[k] || {};
      if (r.in && r.out) {
        Haptic.tick();
        toast('今日已完成打卡，点击下方“微调今日工时”可调整');
      }
    });
  }

  // ---------- 渐进式工时微调抽屉控制器（先选部位，再调数值） ----------
  let adjData = { inTime: '08:30', outTime: '17:30', lunchMin: 60 };
  let adjActivePart = 'in'; // 'in' | 'out' | 'lunch'

  // ---------- 真实物理微调标尺刻度盘 (左右滑动毫秒级跟手·逐1分钟微调) ----------
  let dialStartX = 0;
  let dialStartValue = 0;
  let isDialDragging = false;
  let isDialInitialized = false;
  let lastDeltaMinutes = 0;
  const PIXELS_PER_MINUTE = 8; // 每分钟对应的刻度像素宽度
  const RULER_HALF_SPAN = 90;  // 视口前后覆盖 90 分钟

  function getActivePartValue() {
    if (adjActivePart === 'lunch') return adjData.lunchMin;
    if (adjActivePart === 'in') return toMin(adjData.inTime);
    return toMin(adjData.outTime);
  }

  function pulseBigVal(el) {
    if (!el) return;
    el.classList.remove('num-ticker-update');
    void el.offsetWidth;
    el.classList.add('num-ticker-update');
  }

  function setActivePartValue(newMin) {
    if (adjActivePart === 'lunch') {
      const clamped = Math.max(0, Math.min(240, newMin));
      if (clamped !== adjData.lunchMin) {
        adjData.lunchMin = clamped;
        Haptic.tick();
        pulseBigVal($('adj-lunch-val'));
        updateAdjustSheetUI();
      }
    } else {
      let normMin = newMin % 1440;
      if (normMin < 0) normMin += 1440;
      const timeStr = `${pad(Math.floor(normMin / 60))}:${pad(normMin % 60)}`;
      if (adjActivePart === 'in') {
        if (timeStr !== adjData.inTime) {
          adjData.inTime = timeStr;
          Haptic.tick();
          pulseBigVal($('adj-in-val'));
          updateAdjustSheetUI();
        }
      } else {
        if (timeStr !== adjData.outTime) {
          adjData.outTime = timeStr;
          Haptic.tick();
          pulseBigVal($('adj-out-val'));
          updateAdjustSheetUI();
        }
      }
    }
  }

  function renderDialTicks(baseMin, isLunch = false) {
    const track = $('adj-dial-track');
    if (!track) return;

    let ticksHtml = '';
    for (let delta = -RULER_HALF_SPAN; delta <= RULER_HALF_SPAN; delta++) {
      const currentMin = baseMin + delta;
      const isMajor = delta % 15 === 0;
      const isMed = delta % 5 === 0 && !isMajor;
      const cls = isMajor ? 'major' : (isMed ? 'med' : '');

      let label = '';
      if (isMajor) {
        if (isLunch) {
          const lMin = Math.max(0, currentMin);
          label = `<span class="tick-label">${lMin}分</span>`;
        } else {
          let normMin = currentMin % 1440;
          if (normMin < 0) normMin += 1440;
          const h = Math.floor(normMin / 60);
          const m = normMin % 60;
          label = `<span class="tick-label">${pad(h)}:${pad(m)}</span>`;
        }
      }

      ticksHtml += `<div class="adj-dial-tick ${cls}" data-delta="${delta}"><div class="tick-line"></div>${label}</div>`;
    }

    track.innerHTML = ticksHtml;
    const centerOffset = -(RULER_HALF_SPAN * PIXELS_PER_MINUTE + PIXELS_PER_MINUTE / 2);
    track.style.transition = 'none';
    track.style.transform = `translateX(${centerOffset}px)`;
    track.dataset.centerOffset = centerOffset;
  }

  function refreshDialRuler() {
    const val = getActivePartValue();
    renderDialTicks(val, adjActivePart === 'lunch');
  }

  function initDialScroller() {
    if (isDialInitialized) return;
    const track = $('adj-dial-track');
    const viewport = $('adj-dial-viewport');
    if (!track || !viewport) return;
    isDialInitialized = true;

    refreshDialRuler();

    viewport.addEventListener('pointerdown', e => {
      isDialDragging = true;
      dialStartX = e.clientX;
      dialStartValue = getActivePartValue();
      lastDeltaMinutes = 0;
      viewport.setPointerCapture(e.pointerId);
      viewport.style.cursor = 'grabbing';
      track.style.transition = 'none';
    });

    viewport.addEventListener('pointermove', e => {
      if (!isDialDragging) return;
      const dx = e.clientX - dialStartX;
      const centerOffset = Number(track.dataset.centerOffset || 0);

      // 1. 刻度条画面 100% 毫秒级跟手位移
      track.style.transform = `translateX(${centerOffset + dx}px)`;

      // 2. 逐 1 分钟精准步进增减 (自然手感：向右拨时间减少，向左拨时间增加)
      const deltaMinutes = -Math.round(dx / PIXELS_PER_MINUTE);

      if (deltaMinutes !== lastDeltaMinutes) {
        lastDeltaMinutes = deltaMinutes;
        const targetMin = dialStartValue + deltaMinutes;
        setActivePartValue(targetMin);
      }
    });

    const endDrag = e => {
      if (!isDialDragging) return;
      isDialDragging = false;
      viewport.style.cursor = '';

      const centerOffset = Number(track.dataset.centerOffset || 0);
      const snappedDx = -lastDeltaMinutes * PIXELS_PER_MINUTE;

      // 磁吸对齐平滑动画
      track.style.transition = 'transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1)';
      track.style.transform = `translateX(${centerOffset + snappedDx}px)`;

      setTimeout(() => {
        refreshDialRuler();
      }, 230);
    };

    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
  }

  function switchAdjustPart(part) {
    adjActivePart = part || 'in';
    const dialTitle = $('adj-dial-title');
    if (dialTitle) {
      dialTitle.textContent = adjActivePart === 'lunch'
        ? '左右滑动调节午休时长'
        : (adjActivePart === 'in' ? '左右滑动微调上班时间' : '左右滑动微调下班时间');
    }
    document.querySelectorAll('#adj-tabs .adj-tab').forEach(tab => {
      tab.classList.toggle('on', tab.dataset.part === adjActivePart);
    });
    const panels = {
      in: $('adj-panel-in'),
      out: $('adj-panel-out'),
      lunch: $('adj-panel-lunch')
    };
    Object.keys(panels).forEach(p => {
      const el = panels[p];
      if (!el) return;
      if (p === adjActivePart) {
        el.hidden = false;
        el.classList.add('on');
      } else {
        el.hidden = true;
        el.classList.remove('on');
      }
    });
    // 切换部位后刷新刻度尺到该部位当前时间
    refreshDialRuler();
  }

  function openAdjustSheet(initialPart = 'in') {
    const k = activeKey();
    const r = log[k] || {};
    adjData.inTime = r.in || settings.routineIn || '08:30';
    adjData.outTime = r.out || settings.routineOut || '17:30';
    adjData.lunchMin = r.lunch != null ? r.lunch : (settings.lunch || 60);

    initDialScroller();
    switchAdjustPart(initialPart);
    updateAdjustSheetUI();
    $('adjust-mask').hidden = false;
    $('adjust-sheet').hidden = false;
  }

  function closeAdjustSheet() {
    animateClose($('adjust-sheet'), 200);
    animateClose($('adjust-mask'), 180);
  }

  function shiftTimeMinutes(timeStr, deltaMinutes) {
    let m = toMin(timeStr) + deltaMinutes;
    if (m < 0) m += 1440;
    if (m >= 1440) m %= 1440;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${pad(h)}:${pad(min)}`;
  }

  function updateAdjustSheetUI() {
    // 顶部部位标签数值预览
    if ($('adj-tab-in-val')) $('adj-tab-in-val').textContent = adjData.inTime;
    if ($('adj-tab-out-val')) $('adj-tab-out-val').textContent = adjData.outTime;
    if ($('adj-tab-lunch-val')) $('adj-tab-lunch-val').textContent = `${adjData.lunchMin}分`;

    // 聚焦面板大字
    if ($('adj-in-val')) $('adj-in-val').textContent = adjData.inTime;
    if ($('adj-out-val')) $('adj-out-val').textContent = adjData.outTime;
    if ($('adj-lunch-val')) $('adj-lunch-val').textContent = `${adjData.lunchMin} 分钟`;

    // 高亮午休胶囊
    document.querySelectorAll('#adj-lunch-chips .adj-btn').forEach(btn => {
      btn.classList.toggle('on', Number(btn.dataset.lunch) === adjData.lunchMin);
    });

    // 计算净工时与薪资
    let span = toMin(adjData.outTime) - toMin(adjData.inTime);
    if (span < 0) span += 1440;
    const netMin = Math.max(0, span - adjData.lunchMin);
    const netH = Number((netMin / 60).toFixed(1));
    const wageRate = Number(settings.wage || 30);
    const sal = Number((netH * wageRate).toFixed(2));

    if ($('adj-calc-hours')) $('adj-calc-hours').textContent = `${netH.toFixed(1)} 小时`;
    if ($('adj-calc-salary')) $('adj-calc-salary').textContent = `￥${sal.toFixed(2)}`;
  }

  // 绑定部位切换事件
  const adjTabs = $('adj-tabs');
  if (adjTabs) {
    adjTabs.addEventListener('click', e => {
      const tab = e.target.closest('.adj-tab');
      if (!tab) return;
      switchAdjustPart(tab.dataset.part);
      Haptic.tap();
    });
  }

  // 绑定微调步进按钮事件
  document.querySelectorAll('.adj-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const delta = Number(btn.dataset.delta) || 0;
      if (type === 'in') {
        adjData.inTime = shiftTimeMinutes(adjData.inTime, delta);
        pulseBigVal($('adj-in-val'));
      } else if (type === 'out') {
        adjData.outTime = shiftTimeMinutes(adjData.outTime, delta);
        pulseBigVal($('adj-out-val'));
      }
      refreshDialRuler();
      updateAdjustSheetUI();
      Haptic.tick();
    });
  });

  document.querySelectorAll('#adj-lunch-chips .adj-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      adjData.lunchMin = Number(btn.dataset.lunch) || 0;
      pulseBigVal($('adj-lunch-val'));
      refreshDialRuler();
      updateAdjustSheetUI();
      Haptic.tick();
    });
  });

  $('adjust-save-btn').addEventListener('click', () => {
    const k = activeKey();
    const r = log[k] || (log[k] = {});
    r.in = adjData.inTime;
    r.out = adjData.outTime;
    r.lunch = adjData.lunchMin;
    saveLog();
    renderAll();
    closeAdjustSheet();
    Haptic.success();
    toast(`已更新工时：${fmtH(worked(r))} 小时`);
    if (window.CelebrationFX && settings.celebrationFx !== 'none') {
      window.CelebrationFX.celebrate(settings.celebrationFx || 'confetti');
    }
    autoSyncByStorageMode();
  });

  $('adjust-close').addEventListener('click', closeAdjustSheet);
  $('adjust-mask').addEventListener('click', closeAdjustSheet);
  if ($('btn-quick-adjust')) $('btn-quick-adjust').addEventListener('click', () => {
    Haptic.tick();
    openAdjustSheet('in');
  });

  // 今日卡片触发入口
  $('btn-open-wizard').addEventListener('click', () => { Haptic.tick(); openWizard(activeKey()); });
  $('btn-yesterday-wizard').addEventListener('click', () => { Haptic.tick(); openWizard(keyOf(addDays(new Date(), -1))); });
  $('t-in').addEventListener('click', () => { Haptic.tick(); openAdjustSheet('in'); });
  $('t-out').addEventListener('click', () => { Haptic.tick(); openAdjustSheet('out'); });
  if ($('t-left')) $('t-left').addEventListener('click', () => { Haptic.tick(); openAdjustSheet('lunch'); });

  // ---------- 底部 Tab 切换 — 方向感知动效 ----------
  const viewOrder = ['today', 'records', 'stats'];
  let currentViewIndex = 0;

  function updateTabIndicator(isClick = false, direction = '') {
    const tabsEl = document.querySelector('.tabs');
    const indicator = $('tab-indicator');
    const activeBtn = tabsEl ? tabsEl.querySelector('button.on') : null;
    if (!indicator || !activeBtn) return;
    const tabsRect = tabsEl.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const x = btnRect.left - tabsRect.left + (btnRect.width - 32) / 2;
    indicator.style.setProperty('--tab-indicator-x', x + 'px');

    if (isClick && direction) {
      if (direction === 'slide-left') {
        indicator.style.setProperty('--tab-indicator-origin', 'left center');
      } else if (direction === 'slide-right') {
        indicator.style.setProperty('--tab-indicator-origin', 'right center');
      }
      indicator.style.setProperty('--tab-indicator-w', '56px');
      setTimeout(() => {
        indicator.style.setProperty('--tab-indicator-w', '32px');
      }, 160);
    }
  }

  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    Haptic.tick();
    const targetView = b.dataset.go;
    const targetIndex = viewOrder.indexOf(targetView);
    const direction = targetIndex > currentViewIndex ? 'slide-left' : (targetIndex < currentViewIndex ? 'slide-right' : '');
    currentViewIndex = targetIndex;

    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.view').forEach(v => {
      const isTarget = v.dataset.view === targetView;
      v.classList.remove('on', 'slide-left', 'slide-right');
      if (isTarget) {
        v.classList.add('on');
        if (direction) v.classList.add(direction);
      }
    });
    updateTabIndicator(true, direction);
    renderAll();
    window.scrollTo(0, 0);
  });

  function renderAll() {
    renderToday();
    renderWeek();
    renderMonth();
    renderStats();
  }

  renderAll();

  // 初始化 Tab 滑动指示器位置
  requestAnimationFrame(updateTabIndicator);
  window.addEventListener('resize', updateTabIndicator);

  // 启动页增强退场：进度条填满后退场
  const splash = $('splash');
  if (splash) setTimeout(() => { splash.classList.add('out'); setTimeout(() => splash.remove(), 480); }, 800);
  setInterval(renderToday, 30000);

  // 启动打卡提醒与通知轮询（每 25 秒检测）
  checkReminders();
  setInterval(checkReminders, 25000);

  // URL 参数支持直达指定视图与面板（便于调试与外部捷径）
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('theme')) {
    applyTheme(urlParams.get('theme'));
  }
  if (urlParams.get('view')) {
    const v = urlParams.get('view');
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.go === v));
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('on', el.dataset.view === v));
    renderAll();
  }
  // 单参数快捷模式 (避免命令行多参数转义问题)
  const mode = urlParams.get('mode');
  if (urlParams.get('mock') === '1' && Object.keys(log).length === 0) {
    log = {
      '2026-10-01': { in: '08:30', out: '17:30', lunch: 60 },
      '2026-10-02': { in: '08:25', out: '17:35', lunch: 60 },
      '2026-10-05': { in: '08:30', out: '18:00', lunch: 60 },
      '2026-10-06': { in: '08:20', out: '17:30', lunch: 60 },
      '2026-10-07': { in: '08:30', out: '19:30', lunch: 60 },
      '2026-10-08': { in: '08:30', out: '17:30', lunch: 60 },
      '2026-10-09': { in: '08:30', out: '17:30', lunch: 60 }
    };
    saveLog();
  }

  if (mode === 'stats-local') {
    applyTheme('light');
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.go === 'stats'));
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('on', el.dataset.view === 'stats'));
    switchStorageMode('local');
    renderAll();
  } else if (mode === 'stats-webdav') {
    applyTheme('light');
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.go === 'stats'));
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('on', el.dataset.view === 'stats'));
    switchStorageMode('webdav');
    renderAll();
  } else if (mode === 'stats-cloudflare') {
    applyTheme('light');
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.go === 'stats'));
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('on', el.dataset.view === 'stats'));
    switchStorageMode('cloudflare');
    renderAll();
  } else if (mode === 'stats-dark') {
    applyTheme('dark');
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.go === 'stats'));
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('on', el.dataset.view === 'stats'));
    switchStorageMode('webdav');
    renderAll();
  } else if (mode === 'receipt-modal') {
    applyTheme('light');
    setTimeout(openExportModal, 60);
  } else if (mode === 'receipt-modal-dark') {
    applyTheme('dark');
    setTimeout(openExportModal, 60);
  }

  // ---------- 应用版本与云端更新控制器（首页浮窗与即时重载） ----------
  const APP_VERSION = '1.0.4';
  const CLOUD_PAGES_ORIGIN = 'https://daka-f3o.pages.dev';
  let availableUpdate = null;

  function compareVersions(v1, v2) {
    const p1 = (v1 || '0.0.0').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const p2 = (v2 || '0.0.0').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  // 安全获取原生更新插件（支持 Capacitor 3-8 官方模式与 Bridge 代理模式）
  function getNativeUpdater() {
    if (!window.Capacitor) return null;
    if (window.Capacitor.Plugins && window.Capacitor.Plugins.InAppUpdate) {
      return window.Capacitor.Plugins.InAppUpdate;
    }
    if (typeof window.Capacitor.registerPlugin === 'function') {
      try {
        return window.Capacitor.registerPlugin('InAppUpdate');
      } catch (e) {}
    }
    return null;
  }

  function isNativePlatform() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function showUpdateFloat(data) {
    const floatEl = $('home-update-float');
    if (!floatEl) return;
    const textEl = $('huf-text');
    const badgeText = $('huf-badge-text');
    const actionBtn = $('huf-action-btn');
    if (textEl) textEl.textContent = `发现新版本 v${data.version}`;
    if (badgeText) badgeText.textContent = '新版';
    if (actionBtn) actionBtn.textContent = '立即更新';
    floatEl.classList.remove('is-updating');
    floatEl.hidden = false;
  }

  function hideUpdateFloat() {
    const floatEl = $('home-update-float');
    if (floatEl) animateClose(floatEl, 240);
  }

  function syncUpdateFloatProgress(pct) {
    const floatEl = $('home-update-float');
    if (!floatEl) return;
    const textEl = $('huf-text');
    const badgeText = $('huf-badge-text');
    const actionBtn = $('huf-action-btn');
    floatEl.classList.add('is-updating');
    if (badgeText) badgeText.textContent = `${pct}%`;
    if (textEl) textEl.textContent = '正在软件内极速更新...';
    if (actionBtn) actionBtn.textContent = '查看进度';
  }

  let isUpdating = false;
  let webUpdateTimer = null;

  function openUpdateModal(data) {
    const modal = $('update-modal');
    const mask = $('update-mask');
    const card = $('um-card') || modal?.querySelector('.um-card');
    if (!modal || !mask) return;

    const oldVerEl = $('um-old-ver');
    const newVerEl = $('um-new-ver');
    const notesEl = $('um-notes-content');
    const metaEl = $('um-meta-info');

    if (oldVerEl) oldVerEl.textContent = `当前 v${APP_VERSION}`;
    if (newVerEl) newVerEl.textContent = `最新 v${data.version}`;
    if (notesEl) notesEl.textContent = data.releaseNotes || '性能与体验优化，建议升级。';
    if (metaEl) metaEl.textContent = `发布时间: ${data.buildTime || '最新'} · 软件内安全传输`;

    // 若当前正在更新，保持更新状态机显示，不重置界面
    if (isUpdating) {
      mask.hidden = false;
      modal.hidden = false;
      return;
    }

    // 状态重置
    if (card) {
      card.classList.remove('state-updating', 'state-success');
    }
    const progressBox = $('um-progress-box');
    const successBox = $('um-success-box');
    const bodyContent = $('um-body-content');
    const footer = $('um-footer');
    if (progressBox) progressBox.hidden = true;
    if (successBox) successBox.hidden = true;
    if (bodyContent) bodyContent.style.display = '';
    if (footer) footer.style.display = '';

    const isNative = isNativePlatform();
    const apkBtn = $('btn-download-apk');
    const updateBtn = $('btn-do-update');
    const installBtn = $('btn-install-apk');
    const cancelBtn = $('btn-cancel-update');

    if (installBtn) installBtn.style.display = 'none';

    if (updateBtn) {
      updateBtn.style.display = '';
      updateBtn.textContent = '立即在软件内更新';
      updateBtn.className = 'em-act-btn primary m3-ripple-host';
      updateBtn.disabled = false;
    }

    if (cancelBtn) {
      cancelBtn.textContent = '稍后再说';
      cancelBtn.style.display = '';
    }

    if (apkBtn) {
      if (!isNative && (data.apkUrl || data.downloadUrl)) {
        apkBtn.style.display = 'flex';
        apkBtn.textContent = '保存安装包到本地 (不跳转)';
      } else {
        apkBtn.style.display = 'none';
      }
    }

    mask.hidden = false;
    modal.hidden = false;
  }

  function closeUpdateModal() {
    const modal = $('update-modal');
    const mask = $('update-mask');
    animateClose(modal, 240);
    animateClose(mask, 220);
  }

  // 灵动进度条插值平滑驱动器 (Google Material 3 物理阻尼)
  function setUpdateProgress(pct, statusText, detailText) {
    const fill = $('um-progress-fill');
    const pctEl = $('um-progress-pct');
    const statusEl = $('um-progress-status');
    const detailEl = $('um-progress-detail');
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));

    if (fill) fill.style.width = clamped + '%';
    if (pctEl) pctEl.textContent = clamped + '%';
    if (statusText && statusEl) statusEl.textContent = statusText;
    if (detailText && detailEl) detailEl.textContent = detailText;

    syncUpdateFloatProgress(clamped);
  }

  function showUpdateSuccess(isNative = false) {
    isUpdating = false;
    if (webUpdateTimer) {
      clearInterval(webUpdateTimer);
      webUpdateTimer = null;
    }

    setUpdateProgress(100, '更新就绪', '已完成 100%');
    const card = $('um-card') || document.querySelector('.um-card');
    const progressBox = $('um-progress-box');
    const successBox = $('um-success-box');
    const footer = $('um-footer');
    const updateBtn = $('btn-do-update');
    const installBtn = $('btn-install-apk');
    const cancelBtn = $('btn-cancel-update');
    const apkBtn = $('btn-download-apk');

    if (card) {
      card.classList.remove('state-updating');
      card.classList.add('state-success');
    }

    if (progressBox) progressBox.hidden = true;
    if (successBox) successBox.hidden = false;

    // 触发仪式感礼花喷发与触感反馈
    if (window.CelebrationFX) window.CelebrationFX.triggerCannons();
    if (window.Haptic) Haptic.success();

    if (!isNative) {
      if (footer) footer.style.display = 'none';
      toast('新版本已就绪，正在无缝载入...');
      setTimeout(() => {
        window.location.reload(true);
      }, 1400);
    } else {
      // 原生 Android 环境：提供立即呼起安装按钮
      if (footer) footer.style.display = '';
      if (updateBtn) updateBtn.style.display = 'none';
      if (apkBtn) apkBtn.style.display = 'none';
      if (installBtn) {
        installBtn.style.display = 'flex';
        installBtn.textContent = '立即安装更新';
      }
      if (cancelBtn) {
        cancelBtn.textContent = '完成';
        cancelBtn.style.display = 'flex';
      }
      toast('更新安装包已下载完成，正在唤起系统安装...');
    }
  }

  function showUpdateError(err) {
    isUpdating = false;
    if (webUpdateTimer) {
      clearInterval(webUpdateTimer);
      webUpdateTimer = null;
    }

    const card = $('um-card') || document.querySelector('.um-card');
    if (card) card.classList.remove('state-updating');

    const statusEl = $('um-progress-status');
    const detailEl = $('um-progress-detail');
    const updateBtn = $('btn-do-update');
    const cancelBtn = $('btn-cancel-update');
    const footer = $('um-footer');

    if (statusEl) statusEl.textContent = '更新中断，请检查网络';
    if (detailEl) detailEl.textContent = err || '点击下方按钮重新尝试';
    if (footer) footer.style.display = '';
    if (updateBtn) {
      updateBtn.style.display = '';
      updateBtn.textContent = '重新尝试软件内更新';
      updateBtn.disabled = false;
    }
    if (cancelBtn) {
      cancelBtn.textContent = '稍后再说';
      cancelBtn.style.display = '';
    }
  }

  // 执行核心软件内更新逻辑 (绝不跳转浏览器或下载器)
  async function performInAppUpdate() {
    if (isUpdating) return;
    isUpdating = true;

    const data = availableUpdate || {
      version: '1.0.4',
      downloadUrl: `${CLOUD_PAGES_ORIGIN}/release/daka-1.0.3-android.apk`,
      apkUrl: `${CLOUD_PAGES_ORIGIN}/release/daka-1.0.3-android.apk`
    };

    const card = $('um-card') || document.querySelector('.um-card');
    if (card) card.classList.add('state-updating');

    const progressBox = $('um-progress-box');
    const bodyContent = $('um-body-content');
    const updateBtn = $('btn-do-update');
    const installBtn = $('btn-install-apk');
    const apkBtn = $('btn-download-apk');
    const cancelBtn = $('btn-cancel-update');

    if (bodyContent) bodyContent.style.display = 'none';
    if (progressBox) progressBox.hidden = false;
    if (updateBtn) { updateBtn.hidden = true; updateBtn.style.display = 'none'; }
    if (installBtn) { installBtn.style.display = 'none'; }
    if (apkBtn) { apkBtn.hidden = true; apkBtn.style.display = 'none'; }
    if (cancelBtn) cancelBtn.textContent = '后台继续更新';

    setUpdateProgress(0, '正在建立安全连接...', '软件内高速同步 · 绝不跳转');

    const nativeUpdater = getNativeUpdater();
    const apkUrl = data.apkUrl || data.downloadUrl || `${CLOUD_PAGES_ORIGIN}/release/daka-1.0.3-android.apk`;

    if (nativeUpdater) {
      // 1. Android 原生环境：通过 Capacitor 插件在软件内静默下载至内部 Cache，完成后直接唤起安装
      try {
        nativeUpdater.addListener('updateProgress', pData => {
          const pct = pData.percent >= 0 ? pData.percent : 50;
          let detail = '正在高速传输...';
          if (pData.loaded && pData.total) {
            const mbLoaded = (pData.loaded / (1024 * 1024)).toFixed(1);
            const mbTotal = (pData.total / (1024 * 1024)).toFixed(1);
            detail = `已传输 ${mbLoaded} MB / ${mbTotal} MB · 软件内安全通道`;
          }
          setUpdateProgress(pct, pct < 95 ? '正在软件内下载更新包...' : '正在校验安装包签名...', detail);
        });

        nativeUpdater.addListener('updateComplete', () => {
          showUpdateSuccess(true);
        });

        nativeUpdater.addListener('updateError', err => {
          showUpdateError(err?.error || '网络传输中断');
        });

        await nativeUpdater.startUpdate({ url: apkUrl });
      } catch (e) {
        showUpdateError(e.message || '原生下载异常');
      }
    } else {
      // 2. Web / PWA 环境：在软件内无感预加载所有核心资源、刷写 Cache 与 Service Worker
      try {
        const steps = [
          { p: 18, s: '正在连接版本服务器并校验签名...', d: '校验数据包完整性...' },
          { p: 45, s: '正在软件内预加载应用核心包...', d: '更新核心逻辑与界面资产...' },
          { p: 76, s: '正在更新离线缓存存储...', d: '写入 CacheStorage 高速缓存...' },
          { p: 92, s: '正在刷新 Service Worker 运行时...', d: '注册全新离线环境...' },
          { p: 100, s: '更新完成！', d: '即将无缝生效' }
        ];

        let curStep = 0;
        const advance = () => {
          if (!isUpdating) return;
          if (curStep < steps.length) {
            const item = steps[curStep++];
            setUpdateProgress(item.p, item.s, item.d);
            if (item.p === 100) {
              setTimeout(() => showUpdateSuccess(false), 450);
            }
          }
        };

        advance();
        if (webUpdateTimer) clearInterval(webUpdateTimer);
        webUpdateTimer = setInterval(() => {
          if (curStep < steps.length) {
            advance();
          } else {
            clearInterval(webUpdateTimer);
            webUpdateTimer = null;
          }
        }, 380);

        // 真实清理和更新 ServiceWorker 与 Cache
        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          } catch (e) {}
        }

        if ('serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) await reg.update();
          } catch (e) {}
        }

        // 预热获取关键资源
        try {
          await fetch(`./index.html?_t=${Date.now()}`, { cache: 'reload' }).catch(() => {});
          await fetch(`./app.js?_t=${Date.now()}`, { cache: 'reload' }).catch(() => {});
          await fetch(`./style.css?_t=${Date.now()}`, { cache: 'reload' }).catch(() => {});
        } catch (e) {}

      } catch (err) {
        showUpdateError('缓存更新失败，请重试');
      }
    }
  }

  // 原生 Android 手动触发呼起已下载安装包安装
  async function triggerNativeInstall() {
    const nativeUpdater = getNativeUpdater();
    if (nativeUpdater && nativeUpdater.installDownloadedApk) {
      try {
        toast('正在唤起系统安装器...');
        await nativeUpdater.installDownloadedApk();
      } catch (e) {
        toast('呼起安装失败: ' + (e.message || '请检查未知应用安装权限'));
      }
    }
  }

  // 纯前端静默下载安装包文件到本地 (Blob 方式，绝不跳转浏览器窗口)
  async function downloadApkBlobInApp() {
    const data = availableUpdate || {};
    const url = data.apkUrl || data.downloadUrl || `${CLOUD_PAGES_ORIGIN}/release/daka-1.0.3-android.apk`;
    toast('正在软件内下载 APK 安装包...');

    try {
      const progressBox = $('um-progress-box');
      const bodyContent = $('um-body-content');
      const updateBtn = $('btn-do-update');
      const apkBtn = $('btn-download-apk');
      if (bodyContent) bodyContent.style.display = 'none';
      if (progressBox) progressBox.hidden = false;
      if (updateBtn) updateBtn.style.display = 'none';
      if (apkBtn) apkBtn.style.display = 'none';

      setUpdateProgress(15, '正在请求安装包数据...', '软件内高速直接传输');

      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const contentLength = res.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = res.body.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total > 0) {
          const pct = Math.round((loaded / total) * 100);
          setUpdateProgress(pct, '正在软件内传输安装包...', `${(loaded / 1048576).toFixed(1)} MB / ${(total / 1048576).toFixed(1)} MB`);
        } else {
          setUpdateProgress(60, '正在软件内接收数据...', `${(loaded / 1048576).toFixed(1)} MB 已下载`);
        }
      }

      setUpdateProgress(100, '传输完成！正在保存到本地...', '完成');
      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `daka-${data.version || 'release'}.apk`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

      toast('安装包已保存至本地');
      setTimeout(() => closeUpdateModal(), 800);
    } catch (e) {
      showUpdateError('安装包下载失败: ' + e.message);
    }
  }

  async function checkForAppUpdate(isManual = false) {
    if (isManual) toast('正在检查新版本...');
    try {
      const endpoints = [];
      // 1. 用户手动设置的云端同步域名
      if (settings.cloudOrigin && settings.cloudOrigin.startsWith('http')) {
        endpoints.push(`${settings.cloudOrigin.replace(/\/+$/, '')}/version.json`);
      }
      // 2. 官方 Cloudflare Pages 生产域名（主用）
      endpoints.push(`${CLOUD_PAGES_ORIGIN}/version.json`);
      // 3. 当前运行环境自身域名（若线上部署在自定义域名下）
      if (location.origin && !location.origin.includes('localhost') && location.origin.startsWith('http')) {
        const originUrl = `${location.origin.replace(/\/+$/, '')}/version.json`;
        if (!endpoints.includes(originUrl)) endpoints.push(originUrl);
      }

      let remoteData = null;
      for (const url of endpoints) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 6000);
          const res = await fetch(`${url}?_t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
          clearTimeout(tid);
          if (res.ok) {
            const data = await res.json();
            if (data && data.version) {
              remoteData = data;
              break;
            }
          }
        } catch (e) {}
      }

      // 若处于非 Native 离线 PWA 环境，尝试本地 fallback
      const isNative = isNativePlatform();
      if (!remoteData && !isNative) {
        try {
          const res = await fetch(`./version.json?_t=${Date.now()}`, { cache: 'no-store' });
          if (res.ok) {
            const localData = await res.json();
            if (localData && localData.version) remoteData = localData;
          }
        } catch (e) {}
      }

      if (!remoteData || !remoteData.version) {
        if (isManual) toast('无法连接到更新服务器，请检查手机网络');
        return;
      }

      if (compareVersions(remoteData.version, APP_VERSION) > 0) {
        availableUpdate = remoteData;
        showUpdateFloat(remoteData);
        if (isManual) openUpdateModal(remoteData);
      } else {
        if (isManual) toast(`当前已是最新版本 (v${APP_VERSION})`);
      }
    } catch (e) {
      if (isManual) toast('检查更新失败，请重试');
    }
  }

  // 绑定更新相关事件
  if ($('huf-trigger')) $('huf-trigger').addEventListener('click', () => {
    if (availableUpdate) openUpdateModal(availableUpdate);
  });
  if ($('huf-action-btn')) $('huf-action-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (availableUpdate) openUpdateModal(availableUpdate);
  });
  if ($('huf-close-btn')) $('huf-close-btn').addEventListener('click', e => {
    e.stopPropagation();
    hideUpdateFloat();
  });
  if ($('btn-cancel-update')) $('btn-cancel-update').addEventListener('click', closeUpdateModal);
  if ($('update-mask')) $('update-mask').addEventListener('click', () => {
    if (!isUpdating) closeUpdateModal();
  });
  if ($('btn-check-update')) $('btn-check-update').addEventListener('click', () => checkForAppUpdate(true));

  // 软件内下载 APK 安装包 (Blob 方式，绝不跳转浏览器)
  if ($('btn-download-apk')) $('btn-download-apk').addEventListener('click', downloadApkBlobInApp);

  // 软件内即时更新并生效
  if ($('btn-do-update')) $('btn-do-update').addEventListener('click', performInAppUpdate);

  // 原生唤起已下载 APK 安装
  if ($('btn-install-apk')) $('btn-install-apk').addEventListener('click', triggerNativeInstall);

  if ($('set-current-version')) $('set-current-version').textContent = 'v' + APP_VERSION;

  // Google Material 3 全局辐射动态水波纹绑定 — 严格防止溢出
  document.addEventListener('pointerdown', e => {
    const host = e.target.closest('.m3-ripple-host, .em-act-btn, .huf-btn, .huf-close, .m3-seg-tab, .adj-btn, .cell, .tool-btn, .black-hero-btn, .tabs button');
    if (!host || host.disabled) return;
    host.style.position = host.style.position || 'relative';
    host.style.overflow = 'hidden';
    const rect = host.getBoundingClientRect();
    const x = e.clientX ? (e.clientX - rect.left) : (rect.width / 2);
    const y = e.clientY ? (e.clientY - rect.top) : (rect.height / 2);
    const radius = Math.max(rect.width, rect.height) * 1.35;

    const ripple = document.createElement('span');
    ripple.className = 'm3-ripple-wave';
    ripple.style.width = ripple.style.height = `${radius * 2}px`;
    ripple.style.left = `${x - radius}px`;
    ripple.style.top = `${y - radius}px`;

    host.appendChild(ripple);
    setTimeout(() => ripple.remove(), 550);
  }, { passive: true });

  if (mode === 'update-float') {
    availableUpdate = {
      version: '1.0.4',
      buildTime: '2026-10-10 12:00:00',
      releaseNotes: '1. 软件内无缝高速更新，绝不跳转浏览器与下载器\n2. 纯正 Google Material 3 灵动动效：流体进度条、发光波纹与 SVG 完成弹跳\n3. 导航栏弹性拉伸指示器与微交互触感升级'
    };
    showUpdateFloat(availableUpdate);
  } else if (mode === 'update-modal') {
    availableUpdate = {
      version: '1.0.4',
      buildTime: '2026-10-10 12:00:00',
      releaseNotes: '1. 软件内无缝高速更新，绝不跳转浏览器与下载器\n2. 纯正 Google Material 3 灵动动效：流体进度条、发光波纹与 SVG 完成弹跳\n3. 导航栏弹性拉伸指示器与微交互触感升级'
    };
    openUpdateModal(availableUpdate);
  }

  // 启动自检
  setTimeout(() => checkForAppUpdate(false), 1500);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
