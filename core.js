// 工时打卡核心数据层：校验、迁移、合并、净化与转义。
// 同时支持浏览器全局 (window.WorklogCore) 与 Node require，便于单元测试。
// 严格规范：绝不使用任何 emoji
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WorklogCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const MAX_RECORDS = 10000;
  const MAX_NOTE = 500;
  const MAX_NAME = 40;

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function isValidDateKey(key) {
    if (typeof key !== 'string' || !DATE_RE.test(key)) return false;
    const parts = key.split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (y < 1970 || y > 2200) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function isValidTime(value) {
    return typeof value === 'string' && (value === '' || TIME_RE.test(value));
  }

  function normalizeTimestamp(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function normalizeText(value, maxLength) {
    return String(value == null ? '' : value).slice(0, maxLength);
  }

  function normalizeRecord(raw) {
    if (!isPlainObject(raw)) return null;
    const inTime = typeof raw.in === 'string' ? raw.in.trim() : '';
    const outTime = typeof raw.out === 'string' ? raw.out.trim() : '';
    const lunchStart = typeof raw.lunchStart === 'string' ? raw.lunchStart.trim() : '';
    const lunchEnd = typeof raw.lunchEnd === 'string' ? raw.lunchEnd.trim() : '';
    if (!isValidTime(inTime) || !isValidTime(outTime)) return null;
    if (!isValidTime(lunchStart) || !isValidTime(lunchEnd)) return null;

    let lunch = Number(raw.lunch);
    if (!Number.isFinite(lunch)) lunch = 0;
    lunch = Math.max(0, Math.min(1440, Math.round(lunch)));

    return {
      in: inTime,
      out: outTime,
      lunch: lunch,
      lunchStart: lunchStart,
      lunchEnd: lunchEnd,
      note: typeof raw.note === 'string' ? normalizeText(raw.note, MAX_NOTE) : '',
      updatedAt: normalizeTimestamp(raw.updatedAt)
    };
  }

  // 将历史 localStorage 数据整理成新结构：非法 key/记录丢弃，旧记录补 updatedAt。
  function migrateState(rawLog, rawTomb) {
    const sourceLog = isPlainObject(rawLog) ? rawLog : {};
    const sourceTomb = isPlainObject(rawTomb) ? rawTomb : {};
    const log = {};
    const tombstones = {};
    let changed = (rawLog != null && !isPlainObject(rawLog)) || (rawTomb != null && !isPlainObject(rawTomb));

    const keys = new Set(Object.keys(sourceLog).concat(Object.keys(sourceTomb)));
    keys.forEach(function (key) {
      if (!isValidDateKey(key)) {
        changed = true;
        return;
      }
      const rec = normalizeRecord(sourceLog[key]);
      const tomb = normalizeTimestamp(sourceTomb[key]);
      if (!rec && tomb <= 0) {
        changed = true;
        return;
      }
      // 同一 key 同时存在记录与墓碑时，时间更晚者胜出；时间相同则墓碑胜出，避免复活。
      if (tomb > 0 && (!rec || tomb >= rec.updatedAt)) {
        tombstones[key] = tomb;
      } else if (rec) {
        log[key] = rec;
      }
      if (!rec && tomb > 0) return;
      if (rec && !isPlainObject(sourceLog[key])) changed = true;
      if (rec && normalizeTimestamp(sourceLog[key].updatedAt) !== rec.updatedAt) changed = true;
    });

    return { log: log, tombstones: tombstones, changed: changed };
  }

  // 合并本地与远端状态。输入输出均为纯数据，不修改原对象。
  function mergeState(local, remote) {
    const localState = isPlainObject(local) ? local : {};
    const remoteState = isPlainObject(remote) ? remote : {};
    const localLog = isPlainObject(localState.log) ? localState.log : {};
    const remoteLog = isPlainObject(remoteState.log) ? remoteState.log : {};
    const localTomb = isPlainObject(localState.tombstones) ? localState.tombstones : {};
    const remoteTomb = isPlainObject(remoteState.tombstones) ? remoteState.tombstones : {};
    const log = {};
    const tombstones = {};

    const keys = new Set(
      Object.keys(localLog)
        .concat(Object.keys(remoteLog))
        .concat(Object.keys(localTomb))
        .concat(Object.keys(remoteTomb))
    );

    keys.forEach(function (key) {
      if (!isValidDateKey(key)) return;
      const lRec = normalizeRecord(localLog[key]);
      const rRec = normalizeRecord(remoteLog[key]);
      const lTomb = normalizeTimestamp(localTomb[key]);
      const rTomb = normalizeTimestamp(remoteTomb[key]);

      const lTombWins = lTomb > 0 && (!lRec || lTomb >= lRec.updatedAt);
      const rTombWins = rTomb > 0 && (!rRec || rTomb >= rRec.updatedAt);
      const lTime = lTombWins ? lTomb : (lRec ? lRec.updatedAt : 0);
      const rTime = rTombWins ? rTomb : (rRec ? rRec.updatedAt : 0);
      const lHas = lTombWins || !!lRec;
      const rHas = rTombWins || !!rRec;
      if (!lHas && !rHas) return;

      let pickLocal;
      if (!rHas) pickLocal = true;
      else if (!lHas) pickLocal = false;
      else if (lTime > rTime) pickLocal = true;
      else if (rTime > lTime) pickLocal = false;
      else if (lTombWins && !rTombWins) pickLocal = true;
      else if (rTombWins && !lTombWins) pickLocal = false;
      else pickLocal = true; // 同为记录或同为墓碑且时间相同：保留本地

      if (pickLocal) {
        if (lTombWins) tombstones[key] = lTomb;
        else if (lRec) log[key] = lRec;
      } else {
        if (rTombWins) tombstones[key] = rTomb;
        else if (rRec) log[key] = rRec;
      }
    });

    return { log: log, tombstones: tombstones };
  }

  // 导出/上云时剔除凭据，避免密码进入备份文件或云端。
  function sanitizeSettingsForExport(settings) {
    if (!isPlainObject(settings)) return {};
    const out = Object.assign({}, settings);
    if (isPlainObject(out.webdav)) {
      out.webdav = Object.assign({}, out.webdav);
      delete out.webdav.pass;
    }
    if (isPlainObject(out.routineLunch)) out.routineLunch = Object.assign({}, out.routineLunch);
    delete out.cloudUserId;
    delete out.syncToken;
    return out;
  }

  function pickEnum(value, allowed, fallback) {
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function pickNumber(value, min, max, fallback, integer) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const clamped = Math.max(min, Math.min(max, n));
    return integer ? Math.round(clamped) : clamped;
  }

  // 导入设置只接受白名单字段，且不允许把同步/凭据一起导入。
  function normalizeImportedSettings(raw) {
    if (!isPlainObject(raw)) return {};
    const out = {};
    if (typeof raw.userName === 'string') out.userName = normalizeText(raw.userName, MAX_NAME);
    if (raw.wage != null) out.wage = pickNumber(raw.wage, 0, 9999, 30, false);
    if (raw.std != null) out.std = pickNumber(raw.std, 1, 24, 8, false);
    if (raw.lunch != null) out.lunch = pickNumber(raw.lunch, 0, 240, 60, true);
    if (isValidTime(raw.routineIn) && raw.routineIn) out.routineIn = raw.routineIn;
    if (isValidTime(raw.routineOut) && raw.routineOut) out.routineOut = raw.routineOut;
    if (isValidTime(raw.reminderInTime) && raw.reminderInTime) out.reminderInTime = raw.reminderInTime;
    if (isValidTime(raw.reminderOutTime) && raw.reminderOutTime) out.reminderOutTime = raw.reminderOutTime;
    if (raw.themeMode != null) out.themeMode = pickEnum(raw.themeMode, ['system', 'light', 'dark'], 'system');
    if (raw.textSize != null) out.textSize = pickEnum(raw.textSize, ['standard', 'large', 'huge'], 'standard');
    if (raw.hwSpeed != null) out.hwSpeed = pickEnum(raw.hwSpeed, ['instant', 'fast', 'balanced', 'relaxed'], 'fast');
    if (raw.celebrationFx != null) out.celebrationFx = pickEnum(raw.celebrationFx, ['confetti', 'banknote', 'both', 'none'], 'confetti');
    if (typeof raw.hapticEnabled === 'boolean') out.hapticEnabled = raw.hapticEnabled;
    if (typeof raw.reminderInEnabled === 'boolean') out.reminderInEnabled = raw.reminderInEnabled;
    if (typeof raw.reminderOutEnabled === 'boolean') out.reminderOutEnabled = raw.reminderOutEnabled;
    if (typeof raw.exportTheme === 'string') out.exportTheme = normalizeText(raw.exportTheme, 30);
    if (isPlainObject(raw.routineLunch)) {
      const start = raw.routineLunch.start;
      const end = raw.routineLunch.end;
      if (isValidTime(start) && isValidTime(end) && start && end) {
        out.routineLunch = {
          start: start,
          end: end,
          span: pickNumber(raw.routineLunch.span, 0, 240, 60, true)
        };
      }
    }
    if (isPlainObject(raw.webdav)) {
      const url = typeof raw.webdav.url === 'string' ? raw.webdav.url.trim() : '';
      if (!url || url.indexOf('https://') === 0) {
        out.webdav = {
          url: url,
          user: normalizeText(raw.webdav.user, 100),
          pass: '',
          filename: normalizeText(raw.webdav.filename || 'worklog-backup.json', 100) || 'worklog-backup.json'
        };
      }
    }
    // 导入永远不开启同步，避免旧备份把设备重新接入云端。
    out.storageMode = 'local';
    out.syncEnabled = false;
    out.autoCloudSync = false;
    return out;
  }

  function validateBackup(data) {
    if (!isPlainObject(data)) return { ok: false, error: '备份文件格式不正确' };
    if (data.app && data.app !== 'worklog') return { ok: false, error: '不是本应用的备份文件' };
    if (!isPlainObject(data.log)) return { ok: false, error: '缺少打卡记录' };

    const logKeys = Object.keys(data.log);
    if (logKeys.length > MAX_RECORDS) return { ok: false, error: '记录数量超出限制' };
    const log = {};
    for (let i = 0; i < logKeys.length; i++) {
      const key = logKeys[i];
      if (!isValidDateKey(key)) return { ok: false, error: '日期格式不正确：' + key };
      const rec = normalizeRecord(data.log[key]);
      if (!rec) return { ok: false, error: key + ' 的记录格式不正确' };
      log[key] = rec;
    }

    const rawTomb = isPlainObject(data.tombstones) ? data.tombstones : {};
    const tombKeys = Object.keys(rawTomb);
    if (tombKeys.length > MAX_RECORDS) return { ok: false, error: '删除记录数量超出限制' };
    const tombstones = {};
    for (let j = 0; j < tombKeys.length; j++) {
      const key = tombKeys[j];
      if (!isValidDateKey(key)) return { ok: false, error: '删除日期格式不正确：' + key };
      const ts = normalizeTimestamp(rawTomb[key]);
      if (ts <= 0) return { ok: false, error: key + ' 的删除时间不正确' };
      tombstones[key] = ts;
    }

    const migrated = migrateState(log, tombstones);
    return {
      ok: true,
      log: migrated.log,
      tombstones: migrated.tombstones,
      settings: normalizeImportedSettings(data.settings)
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function safeFilename(value, fallback) {
    const cleaned = String(value == null ? '' : value)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/^\.+/, '')
      .trim();
    return (cleaned || fallback || 'export').slice(0, 80);
  }

  // CSV 单元格：统一加引号，并对公式起始字符做防注入处理。
  function csvCell(value) {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return {
    DATE_RE: DATE_RE,
    TIME_RE: TIME_RE,
    MAX_RECORDS: MAX_RECORDS,
    MAX_NOTE: MAX_NOTE,
    isPlainObject: isPlainObject,
    isValidDateKey: isValidDateKey,
    isValidTime: isValidTime,
    normalizeRecord: normalizeRecord,
    normalizeTimestamp: normalizeTimestamp,
    migrateState: migrateState,
    mergeState: mergeState,
    sanitizeSettingsForExport: sanitizeSettingsForExport,
    normalizeImportedSettings: normalizeImportedSettings,
    validateBackup: validateBackup,
    escapeHtml: escapeHtml,
    safeFilename: safeFilename,
    csvCell: csvCell
  };
});
