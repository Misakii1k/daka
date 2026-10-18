const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

const T1 = 1000;
const T2 = 2000;
const T3 = 3000;

function rec(patch, updatedAt) {
  return Object.assign({ in: '08:30', out: '17:30', lunch: 60, note: '' }, patch, { updatedAt });
}

test('isValidDateKey 只接受真实存在的日期', () => {
  assert.equal(core.isValidDateKey('2026-10-18'), true);
  assert.equal(core.isValidDateKey('2026-02-30'), false);
  assert.equal(core.isValidDateKey('2026-1-1'), false);
  assert.equal(core.isValidDateKey('abcd-ef-gh'), false);
});

test('normalizeRecord 校验时间并限制午休与备注', () => {
  assert.equal(core.normalizeRecord(null), null);
  assert.equal(core.normalizeRecord({ in: '25:00', out: '17:30' }), null);
  const record = core.normalizeRecord({
    in: '08:30',
    out: '17:30',
    lunch: 9999,
    note: 'x'.repeat(600),
    updatedAt: T1
  });
  assert.equal(record.lunch, 1440);
  assert.equal(record.note.length, core.MAX_NOTE);
  assert.equal(record.updatedAt, T1);
});

test('migrateState 丢弃非法 key 并为旧记录补 0 时间戳', () => {
  const migrated = core.migrateState(
    {
      '2026-10-01': { in: '08:30', out: '17:30', lunch: 60 },
      'not-a-date': { in: '08:30', out: '17:30' }
    },
    {}
  );
  assert.deepEqual(Object.keys(migrated.log), ['2026-10-01']);
  assert.equal(migrated.log['2026-10-01'].updatedAt, 0);
  assert.equal(migrated.changed, true);
});

test('migrateState 同时存在记录与墓碑时，时间更晚者胜出', () => {
  const migrated = core.migrateState(
    { '2026-10-01': rec({}, T1) },
    { '2026-10-01': T2 }
  );
  assert.equal(migrated.log['2026-10-01'], undefined);
  assert.equal(migrated.tombstones['2026-10-01'], T2);
});

test('mergeState 保留时间更新的本地记录', () => {
  const merged = core.mergeState(
    { log: { '2026-10-01': rec({ note: 'local' }, T2) }, tombstones: {} },
    { log: { '2026-10-01': rec({ note: 'remote' }, T1) }, tombstones: {} }
  );
  assert.equal(merged.log['2026-10-01'].note, 'local');
});

test('mergeState 接受时间更新的远端记录', () => {
  const merged = core.mergeState(
    { log: { '2026-10-01': rec({ note: 'local' }, T1) }, tombstones: {} },
    { log: { '2026-10-01': rec({ note: 'remote' }, T2) }, tombstones: {} }
  );
  assert.equal(merged.log['2026-10-01'].note, 'remote');
});

test('mergeState 墓碑不会被旧记录复活', () => {
  const merged = core.mergeState(
    { log: {}, tombstones: { '2026-10-01': T2 } },
    { log: { '2026-10-01': rec({}, T1) }, tombstones: {} }
  );
  assert.equal(merged.log['2026-10-01'], undefined);
  assert.equal(merged.tombstones['2026-10-01'], T2);
});

test('mergeState 重新创建的新记录可以覆盖旧墓碑', () => {
  const merged = core.mergeState(
    { log: { '2026-10-01': rec({ note: 'recreated' }, T3) }, tombstones: {} },
    { log: {}, tombstones: { '2026-10-01': T2 } }
  );
  assert.equal(merged.log['2026-10-01'].note, 'recreated');
  assert.equal(merged.tombstones['2026-10-01'], undefined);
});

test('mergeState 时间相同：记录对记录保留本地，墓碑对记录墓碑胜出', () => {
  const live = core.mergeState(
    { log: { '2026-10-01': rec({ note: 'local' }, T1) }, tombstones: {} },
    { log: { '2026-10-01': rec({ note: 'remote' }, T1) }, tombstones: {} }
  );
  assert.equal(live.log['2026-10-01'].note, 'local');

  const tomb = core.mergeState(
    { log: {}, tombstones: { '2026-10-01': T1 } },
    { log: { '2026-10-01': rec({}, T1) }, tombstones: {} }
  );
  assert.equal(tomb.log['2026-10-01'], undefined);
  assert.equal(tomb.tombstones['2026-10-01'], T1);
});

test('mergeState 不修改输入对象', () => {
  const local = { log: { '2026-10-01': rec({}, T2) }, tombstones: {} };
  const remote = { log: { '2026-10-02': rec({}, T1) }, tombstones: {} };
  const beforeLocal = JSON.stringify(local);
  const beforeRemote = JSON.stringify(remote);
  core.mergeState(local, remote);
  assert.equal(JSON.stringify(local), beforeLocal);
  assert.equal(JSON.stringify(remote), beforeRemote);
});

test('validateBackup 拒绝非法日期与非法记录', () => {
  assert.equal(core.validateBackup({ log: { 'bad-key': rec({}, T1) } }).ok, false);
  assert.equal(core.validateBackup({ log: { '2026-10-01': { in: '99:99' } } }).ok, false);
  assert.equal(core.validateBackup({ log: 'not-an-object' }).ok, false);
});

test('validateBackup 净化设置：不导入密码、不开启同步', () => {
  const result = core.validateBackup({
    app: 'worklog',
    log: { '2026-10-01': rec({}, T1) },
    tombstones: { '2026-10-02': T2 },
    settings: {
      wage: 50,
      userName: '张三',
      storageMode: 'cloudflare',
      syncEnabled: true,
      autoCloudSync: true,
      webdav: { url: 'https://dav.example.com/', user: 'u', pass: 'secret', filename: 'b.json' }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.settings.wage, 50);
  assert.equal(result.settings.userName, '张三');
  assert.equal(result.settings.storageMode, 'local');
  assert.equal(result.settings.syncEnabled, false);
  assert.equal(result.settings.autoCloudSync, false);
  assert.equal(result.settings.webdav.pass, '');
});

test('sanitizeSettingsForExport 剔除凭据', () => {
  const safe = core.sanitizeSettingsForExport({
    wage: 30,
    cloudUserId: 'dk-1234',
    webdav: { url: 'https://dav.example.com/', user: 'u', pass: 'secret' }
  });
  assert.equal(safe.cloudUserId, undefined);
  assert.equal(safe.webdav.pass, undefined);
  assert.equal(safe.webdav.url, 'https://dav.example.com/');
});

test('csvCell 防公式注入并转义引号', () => {
  assert.equal(core.csvCell('=cmd'), '"\'=cmd"');
  assert.equal(core.csvCell('a"b'), '"a""b"');
  assert.equal(core.csvCell('-1+2'), '"\'-1+2"');
});

test('safeFilename 去掉路径分隔符与隐藏前缀', () => {
  assert.equal(core.safeFilename('../../etc/passwd', 'fallback'), '_.._etc_passwd');
  assert.equal(core.safeFilename('a/b:c*?.png', 'fallback'), 'a_b_c__.png');
  assert.equal(core.safeFilename('', 'fallback'), 'fallback');
});
