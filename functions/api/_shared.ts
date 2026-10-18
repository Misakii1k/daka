// Cloudflare Pages Functions 共享工具
// 严格规范：绝不使用任何 emoji

export interface Env {
  DB?: any; // Cloudflare D1 Database binding
  API_SECRET?: string;
  SYNC_ENABLED?: string;
  WEBDAV_PROXY_ENABLED?: string;
  WEBDAV_PROXY_SECRET?: string;
  EXPORT_ENABLED?: string;
  NOTIFY_ENABLED?: string;
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ORIGINS = [
  'https://daka-f3o.pages.dev',
  'https://localhost',
  'http://localhost:5173'
];

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function isEnabled(env: Env | undefined, key: keyof Env): boolean {
  const value = env && env[key];
  return String(value || '').toLowerCase() === '1';
}

function allowedOrigins(env: Env | undefined): string[] {
  const raw = env && env.ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ORIGINS;
  return String(raw)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request, env?: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return {};
  const allowed = allowedOrigins(env);
  if (allowed.indexOf('*') >= 0 || allowed.indexOf(origin) >= 0) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin'
    };
  }
  return {};
}

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    }
  });
}

export function handleOptions(request: Request, env?: Env): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-Proxy-Secret',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export function getUserId(request: Request): string {
  const custom = request.headers.get('X-User-Id');
  if (custom && custom.trim().length > 0 && /^[a-zA-Z0-9_-]{1,32}$/.test(custom.trim())) {
    return custom.trim();
  }
  return 'default_user';
}

// 批次 A 仍使用 X-User-Id；但拒绝无身份的 default_user，避免所有匿名请求共享同一份数据。
export function getUserIdOrNull(request: Request): string | null {
  const userId = getUserId(request);
  return userId === 'default_user' ? null : userId;
}

export function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

export function methodNotAllowed(): Response {
  return new Response('Method Not Allowed', { status: 405 });
}

export function isPlainObject(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const parts = key.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
}

export function isValidTime(value: unknown): boolean {
  return typeof value === 'string' && (value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

export async function readJson(request: Request, maxBytes: number = MAX_BODY_BYTES): Promise<any> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('请求体过大');
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('请求体过大');
  return JSON.parse(text);
}
