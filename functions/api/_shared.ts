// Cloudflare Pages Functions 共享工具
// 严格规范：绝不使用任何 emoji

export interface Env {
  DB?: any; // Cloudflare D1 Database binding
  API_SECRET?: string;
}

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
      ...headers,
    },
  });
}

export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export function getUserId(request: Request): string {
  const custom = request.headers.get('X-User-Id');
  if (custom && custom.trim().length > 0 && /^[a-zA-Z0-9_-]{1,32}$/.test(custom.trim())) {
    return custom.trim();
  }
  return 'default_user';
}
