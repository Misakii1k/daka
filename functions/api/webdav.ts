// Cloudflare Pages Functions - 可选 WebDAV 跨域转发代理中继
// 默认关闭；只有显式配置 WEBDAV_PROXY_ENABLED=1 与 WEBDAV_PROXY_SECRET 后才可用。
// 严格规范：绝不使用任何 emoji

import {
  Env,
  corsHeaders,
  handleOptions,
  isEnabled,
  jsonResponse,
  notFound,
  readJson
} from './_shared';

const ALLOWED_METHODS = ['GET', 'PUT', 'PROPFIND'];
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host === '[::1]' || host === '0.0.0.0' || host.endsWith('.localhost')) return true;
  if (host.startsWith('fe80:') || host.startsWith('fc00:') || host.startsWith('fd00:')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,2})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return false;
}

export async function onRequestOptions(context: { request: Request; env: Env }): Promise<Response> {
  return handleOptions(context.request, context.env);
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (!isEnabled(env, 'WEBDAV_PROXY_ENABLED')) return notFound();

  const secret = env.WEBDAV_PROXY_SECRET || '';
  if (!secret || request.headers.get('X-Proxy-Secret') !== secret) {
    return notFound();
  }

  const cors = corsHeaders(request, env);
  let body: any;
  try {
    body = await readJson(request, 6 * 1024 * 1024);
  } catch (err: any) {
    return jsonResponse({ ok: false, error: err.message || '非法的请求数据' }, 400, cors);
  }

  const targetUrl = body && body.targetUrl;
  const method = String((body && body.method) || 'GET').toUpperCase();
  const authHeader = body && body.authHeader;
  const content = body && body.content;

  if (typeof targetUrl !== 'string' || targetUrl.indexOf('https://') !== 0) {
    return jsonResponse({ ok: false, error: '仅支持 https WebDAV 地址' }, 400, cors);
  }
  if (ALLOWED_METHODS.indexOf(method) < 0) {
    return jsonResponse({ ok: false, error: '不支持的请求方法' }, 400, cors);
  }
  if (authHeader != null && (typeof authHeader !== 'string' || authHeader.length > 4096)) {
    return jsonResponse({ ok: false, error: '认证信息格式不正确' }, 400, cors);
  }
  if (content != null && String(content).length > MAX_RESPONSE_BYTES) {
    return jsonResponse({ ok: false, error: '请求内容过大' }, 413, cors);
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return jsonResponse({ ok: false, error: 'WebDAV 地址格式不正确' }, 400, cors);
  }
  if (isPrivateHost(parsed.hostname)) {
    return jsonResponse({ ok: false, error: '不允许访问私网地址' }, 400, cors);
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Daka-Worklog-WebDAV-Client/1.0'
    };
    if (authHeader) headers['Authorization'] = authHeader;
    if (method === 'PUT') headers['Content-Type'] = 'application/json; charset=utf-8';

    const reqInit: RequestInit = {
      method,
      headers,
      redirect: 'manual'
    };
    if (method === 'PUT' && content) {
      reqInit.body = typeof content === 'string' ? content : JSON.stringify(content);
    }

    // 手动跟随重定向，避免通过 302 绕过私网地址校验
    let currentUrl = targetUrl;
    let resp: Response | null = null;
    for (let redirects = 0; redirects < 4; redirects++) {
      resp = await fetch(currentUrl, reqInit);
      if ([301, 302, 303, 307, 308].indexOf(resp.status) < 0) break;
      const location = resp.headers.get('Location');
      if (!location) break;
      const next = new URL(location, currentUrl);
      if (next.protocol !== 'https:' || isPrivateHost(next.hostname)) {
        return jsonResponse({ ok: false, error: '不允许重定向到该地址' }, 400, cors);
      }
      currentUrl = next.toString();
    }
    if (!resp) {
      return jsonResponse({ ok: false, error: 'WebDAV 请求失败' }, 502, cors);
    }

    const respText = await resp.text();
    if (respText.length > MAX_RESPONSE_BYTES) {
      return jsonResponse({ ok: false, error: 'WebDAV 响应内容过大' }, 502, cors);
    }

    return jsonResponse({
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      data: respText
    }, 200, cors);
  } catch (err: any) {
    return jsonResponse({
      ok: false,
      error: '连接 WebDAV 服务器失败: ' + (err.message || String(err))
    }, 502, cors);
  }
}
