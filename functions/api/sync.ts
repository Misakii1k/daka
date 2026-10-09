// Cloudflare Pages Functions - 云端数据库双向同步端点
// 严格规范：绝不使用任何 emoji

import { Env, getUserId, handleOptions, jsonResponse } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const userId = getUserId(request);

  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'D1 数据库未绑定，请在 Cloudflare 控制台或 wrangler.json 中配置 DB 绑定',
      fallback: true
    }, 200);
  }

  try {
    const recordsStmt = env.DB.prepare(
      'SELECT date_key, in_time, out_time, lunch_minutes, lunch_start, lunch_end, note, updated_at FROM worklog_records WHERE user_id = ? ORDER BY date_key ASC'
    );
    const settingsStmt = env.DB.prepare(
      'SELECT * FROM user_settings WHERE user_id = ?'
    );

    const [recordsRes, settingsRes] = await env.DB.batch([
      recordsStmt.bind(userId),
      settingsStmt.bind(userId)
    ]);

    const worklogMap: Record<string, any> = {};
    if (recordsRes && recordsRes.results) {
      for (const row of recordsRes.results) {
        worklogMap[row.date_key] = {
          in: row.in_time || '',
          out: row.out_time || '',
          lunch: row.lunch_minutes,
          lunchStart: row.lunch_start || '',
          lunchEnd: row.lunch_end || '',
          note: row.note || '',
          updatedAt: row.updated_at
        };
      }
    }

    const settingsObj = (settingsRes && settingsRes.results && settingsRes.results[0]) ? settingsRes.results[0] : null;

    return jsonResponse({
      ok: true,
      userId,
      log: worklogMap,
      settings: settingsObj,
      syncedAt: Date.now()
    });
  } catch (err: any) {
    return jsonResponse({
      ok: false,
      error: '读取 D1 数据库失败: ' + (err.message || String(err))
    }, 500);
  }
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const userId = getUserId(request);

  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'D1 数据库未绑定，数据暂仅保存在本地离线缓存',
      fallback: true
    }, 200);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: '非法的 JSON 数据体' }, 400);
  }

  const { log, settings } = body || {};
  const now = Date.now();
  const statements: any[] = [];

  try {
    // 1. 批量合并记录
    if (log && typeof log === 'object') {
      for (const [dateKey, item] of Object.entries(log)) {
        if (!dateKey || typeof item !== 'object') continue;
        const rec: any = item;
        statements.push(
          env.DB.prepare(`
            INSERT INTO worklog_records (user_id, date_key, in_time, out_time, lunch_minutes, lunch_start, lunch_end, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date_key) DO UPDATE SET
              in_time = excluded.in_time,
              out_time = excluded.out_time,
              lunch_minutes = excluded.lunch_minutes,
              lunch_start = excluded.lunch_start,
              lunch_end = excluded.lunch_end,
              note = excluded.note,
              updated_at = excluded.updated_at
          `).bind(
            userId,
            dateKey,
            rec.in || '',
            rec.out || '',
            rec.lunch != null ? rec.lunch : 60,
            rec.lunchStart || '',
            rec.lunchEnd || '',
            rec.note || '',
            now
          )
        );
      }
    }

    // 2. 保存用户设置
    if (settings && typeof settings === 'object') {
      statements.push(
        env.DB.prepare(`
          INSERT INTO user_settings (
            user_id, user_name, wage_rate, std_hours, lunch_minutes, routine_in, routine_out,
            hw_speed, celebration_fx, theme_mode, text_size, haptic_enabled,
            reminder_in_enabled, reminder_in_time, reminder_out_enabled, reminder_out_time, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            user_name = excluded.user_name,
            wage_rate = excluded.wage_rate,
            std_hours = excluded.std_hours,
            lunch_minutes = excluded.lunch_minutes,
            routine_in = excluded.routine_in,
            routine_out = excluded.routine_out,
            hw_speed = excluded.hw_speed,
            celebration_fx = excluded.celebration_fx,
            theme_mode = excluded.theme_mode,
            text_size = excluded.text_size,
            haptic_enabled = excluded.haptic_enabled,
            reminder_in_enabled = excluded.reminder_in_enabled,
            reminder_in_time = excluded.reminder_in_time,
            reminder_out_enabled = excluded.reminder_out_enabled,
            reminder_out_time = excluded.reminder_out_time,
            updated_at = excluded.updated_at
        `).bind(
          userId,
          settings.userName || '',
          settings.wage || 30,
          settings.std || 8,
          settings.lunch || 60,
          settings.routineIn || '08:30',
          settings.routineOut || '17:30',
          settings.hwSpeed || 'fast',
          settings.celebrationFx || 'confetti',
          settings.themeMode || 'system',
          settings.textSize || 'standard',
          settings.hapticEnabled ? 1 : 0,
          settings.reminderInEnabled ? 1 : 0,
          settings.reminderInTime || '08:20',
          settings.reminderOutEnabled ? 1 : 0,
          settings.reminderOutTime || '17:30',
          now
        )
      );
    }

    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    return jsonResponse({
      ok: true,
      userId,
      syncedCount: statements.length,
      syncedAt: now
    });
  } catch (err: any) {
    return jsonResponse({
      ok: false,
      error: '写入 D1 数据库失败: ' + (err.message || String(err))
    }, 500);
  }
}
