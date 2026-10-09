// Cloudflare Pages Functions - 可选 WebDAV 跨域转发代理中继
// 严格规范：绝不使用任何 emoji

import { handleOptions, jsonResponse } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  const { request } = context;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: '非法的请求数据' }, 400);
  }

  const { targetUrl, method = 'GET', authHeader, content } = body || {};

  if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
    return jsonResponse({ ok: false, error: '缺少有效的 WebDAV 目标地址' }, 400);
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Daka-Worklog-WebDAV-Client/1.0',
    };
    if (authHeader) headers['Authorization'] = authHeader;
    if (method === 'PUT') headers['Content-Type'] = 'application/json; charset=utf-8';

    const reqInit: RequestInit = {
      method,
      headers,
    };
    if (method === 'PUT' && content) {
      reqInit.body = typeof content === 'string' ? content : JSON.stringify(content);
    }

    const resp = await fetch(targetUrl, reqInit);
    const respText = await resp.text();

    return jsonResponse({
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      data: respText,
    });
  } catch (err: any) {
    return jsonResponse({
      ok: false,
      error: '连接 WebDAV 服务器失败: ' + (err.message || String(err)),
    }, 500);
  }
}
