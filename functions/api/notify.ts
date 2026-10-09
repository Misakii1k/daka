// Cloudflare Pages Functions - 打卡提醒通知与订阅端点
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
      ok: true,
      reminders: {
        in: { enabled: true, time: '08:20', text: '该准备上班打卡了' },
        out: { enabled: true, time: '17:30', text: '下班时间到了，记得打卡' },
      },
      offlineNotice: true,
    });
  }

  try {
    const res = await env.DB.prepare(
      'SELECT reminder_in_enabled, reminder_in_time, reminder_out_enabled, reminder_out_time FROM user_settings WHERE user_id = ?'
    ).bind(userId).first();

    return jsonResponse({
      ok: true,
      userId,
      reminders: {
        in: {
          enabled: res ? Boolean(res.reminder_in_enabled) : true,
          time: res ? (res.reminder_in_time || '08:20') : '08:20',
          text: '该准备上班打卡了'
        },
        out: {
          enabled: res ? Boolean(res.reminder_out_enabled) : true,
          time: res ? (res.reminder_out_time || '17:30') : '17:30',
          text: '下班时间到了，记得打卡'
        }
      }
    });
  } catch (err: any) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const userId = getUserId(request);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: '非法的 JSON 请求体' }, 400);
  }

  const { subscription } = body;
  if (!subscription || !subscription.endpoint) {
    return jsonResponse({ ok: false, error: '缺少有效的推送订阅凭证' }, 400);
  }

  if (env.DB) {
    try {
      const now = Date.now();
      await env.DB.prepare(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          user_id = excluded.user_id,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          updated_at = excluded.updated_at
      `).bind(
        userId,
        subscription.endpoint,
        subscription.keys?.p256dh || '',
        subscription.keys?.auth || '',
        now,
        now
      ).run();
    } catch (err: any) {
      return jsonResponse({ ok: false, error: '保存订阅失败: ' + err.message }, 500);
    }
  }

  return jsonResponse({
    ok: true,
    message: '推送通知订阅凭证已成功接收',
    savedAt: Date.now()
  });
}
