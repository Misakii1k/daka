// Cloudflare Pages Functions - 云端数据库双向同步端点
// 严格规范：绝不使用任何 emoji

import {
  Env,
  corsHeaders,
  getUserIdFromAuth,
  handleOptions,
  isEnabled,
  isPlainObject,
  isValidDateKey,
  isValidTime,
  jsonResponse,
  notFound,
  readJson
} from './_shared';

const MAX_RECORDS = 5000;
const MAX_NOTE = 500;
const BATCH_SIZE = 100;

export async function onRequestOptions(context: { request: Request; env: Env }): Promise<Response> {
  return handleOptions(context.request, context.env);
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (!isEnabled(env, 'SYNC_ENABLED')) return notFound();
  const cors = corsHeaders(request, env);
  const userId = await getUserIdFromAuth(request);
  if (!userId) {
    return jsonResponse({ ok: false, error: '同步码无效' }, 401, cors);
  }

  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'D1 数据库未绑定，请在 Cloudflare 控制台或 wrangler.json 中配置 DB 绑定',
      fallback: true
    }, 200, cors);
  }

  try {
    const result = await env.DB.prepare(
      'SELECT date_key, in_time, out_time, lunch_minutes, lunch_start, lunch_end, note, updated_at, deleted_at FROM worklog_records WHERE user_id = ? ORDER BY date_key ASC'
    ).bind(userId).all();

    const log: Record<string, any> = {};
    const tombstones: Record<string, number> = {};
    const rows = (result && result.results) || [];
    for (const row of rows) {
      if (!row || !row.date_key) continue;
      const deletedAt = Number(row.deleted_at) || 0;
      if (deletedAt > 0) {
        tombstones[row.date_key] = deletedAt;
      } else {
        log[row.date_key] = {
          in: row.in_time || '',
          out: row.out_time || '',
          lunch: row.lunch_minutes,
          lunchStart: row.lunch_start || '',
          lunchEnd: row.lunch_end || '',
          note: row.note || '',
          updatedAt: Number(row.updated_at) || 0
        };
      }
    }

    return jsonResponse({
      ok: true,
      userId,
      log,
      tombstones,
      syncedAt: Date.now()
    }, 200, cors);
  } catch (err: any) {
    return jsonResponse({
      ok: false,
      error: '读取 D1 数据库失败: ' + (err.message || String(err))
    }, 500, cors);
  }
}

function normalizeRecord(item: any): { ok: boolean; record?: any; error?: string } {
  if (!isPlainObject(item)) return { ok: false, error: '记录格式不正确' };
  const inTime = item.in == null ? '' : item.in;
  const outTime = item.out == null ? '' : item.out;
  const lunchStart = item.lunchStart == null ? '' : item.lunchStart;
  const lunchEnd = item.lunchEnd == null ? '' : item.lunchEnd;
  if (!isValidTime(inTime) || !isValidTime(outTime)) return { ok: false, error: '时间格式不正确' };
  if (!isValidTime(lunchStart) || !isValidTime(lunchEnd)) return { ok: false, error: '午休时间格式不正确' };
  const lunch = Number(item.lunch);
  if (item.lunch != null && (!Number.isFinite(lunch) || lunch < 0 || lunch > 1440)) {
    return { ok: false, error: '午休时长不正确' };
  }
  const note = item.note == null ? '' : String(item.note);
  if (note.length > MAX_NOTE) return { ok: false, error: '备注过长' };
  const updatedAt = Number(item.updatedAt);
  return {
    ok: true,
    record: {
      in: inTime,
      out: outTime,
      lunch: Number.isFinite(lunch) ? Math.round(lunch) : 0,
      lunchStart: lunchStart,
      lunchEnd: lunchEnd,
      note: note,
      updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : 0
    }
  };
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (!isEnabled(env, 'SYNC_ENABLED')) return notFound();
  const cors = corsHeaders(request, env);
  const userId = await getUserIdFromAuth(request);
  if (!userId) {
    return jsonResponse({ ok: false, error: '同步码无效' }, 401, cors);
  }

  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'D1 数据库未绑定，数据暂仅保存在本地离线缓存',
      fallback: true
    }, 200, cors);
  }

  let body: any;
  try {
    body = await readJson(request);
  } catch (err: any) {
    return jsonResponse({ ok: false, error: err.message || '非法的 JSON 数据体' }, 400, cors);
  }

  const log = isPlainObject(body && body.log) ? body.log : {};
  const tombstones = isPlainObject(body && body.tombstones) ? body.tombstones : {};
  const logKeys = Object.keys(log);
  const tombKeys = Object.keys(tombstones);
  if (logKeys.length > MAX_RECORDS || tombKeys.length > MAX_RECORDS) {
    return jsonResponse({ ok: false, error: '记录数量超出限制' }, 413, cors);
  }

  const now = Date.now();
  const statements: any[] = [];

  try {
    for (const dateKey of logKeys) {
      if (!isValidDateKey(dateKey)) {
        return jsonResponse({ ok: false, error: '日期格式不正确: ' + dateKey }, 400, cors);
      }
      const normalized = normalizeRecord(log[dateKey]);
      if (!normalized.ok || !normalized.record) {
        return jsonResponse({ ok: false, error: dateKey + ' ' + (normalized.error || '记录格式不正确') }, 400, cors);
      }
      const rec = normalized.record;
      statements.push(
        env.DB.prepare(`
          INSERT INTO worklog_records (user_id, date_key, in_time, out_time, lunch_minutes, lunch_start, lunch_end, note, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(user_id, date_key) DO UPDATE SET
            in_time = excluded.in_time,
            out_time = excluded.out_time,
            lunch_minutes = excluded.lunch_minutes,
            lunch_start = excluded.lunch_start,
            lunch_end = excluded.lunch_end,
            note = excluded.note,
            updated_at = excluded.updated_at,
            deleted_at = 0
          WHERE excluded.updated_at > worklog_records.updated_at
        `).bind(
          userId,
          dateKey,
          rec.in,
          rec.out,
          rec.lunch,
          rec.lunchStart,
          rec.lunchEnd,
          rec.note,
          rec.updatedAt || 0
        )
      );
    }

    for (const dateKey of tombKeys) {
      if (!isValidDateKey(dateKey)) {
        return jsonResponse({ ok: false, error: '删除日期格式不正确: ' + dateKey }, 400, cors);
      }
      const deletedAt = Number(tombstones[dateKey]);
      if (!Number.isFinite(deletedAt) || deletedAt <= 0) {
        return jsonResponse({ ok: false, error: dateKey + ' 的删除时间不正确' }, 400, cors);
      }
      statements.push(
        env.DB.prepare(`
          INSERT INTO worklog_records (user_id, date_key, in_time, out_time, lunch_minutes, lunch_start, lunch_end, note, updated_at, deleted_at)
          VALUES (?, ?, '', '', 0, '', '', '', ?, ?)
          ON CONFLICT(user_id, date_key) DO UPDATE SET
            in_time = '',
            out_time = '',
            lunch_minutes = 0,
            lunch_start = '',
            lunch_end = '',
            note = '',
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
          WHERE excluded.updated_at >= worklog_records.updated_at
        `).bind(userId, dateKey, deletedAt, deletedAt)
      );
    }

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      await env.DB.batch(statements.slice(i, i + BATCH_SIZE));
    }

    return jsonResponse({
      ok: true,
      userId,
      syncedCount: statements.length,
      syncedAt: now
    }, 200, cors);
  } catch (err: any) {
    return jsonResponse({
      ok: false,
      error: '写入 D1 数据库失败: ' + (err.message || String(err))
    }, 500, cors);
  }
}
