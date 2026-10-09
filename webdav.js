// 纯原生离线 WebDAV 云网盘客户端
// 严格规范：绝不使用任何 emoji

(function(root) {
  'use strict';

  function toBase64(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch {
      return btoa(str);
    }
  }

  function getAuthHeader(user, pass) {
    if (!user && !pass) return '';
    return 'Basic ' + toBase64(`${user || ''}:${pass || ''}`);
  }

  function normalizeUrl(baseUrl, filename) {
    let u = baseUrl.trim();
    if (!u.endsWith('/')) u += '/';
    return u + filename.replace(/^\/+/, '');
  }

  const WebDAVClient = {
    // 1. 测试连接
    async testConnection(config) {
      const { url, user, pass } = config;
      if (!url || !url.startsWith('http')) {
        return { ok: false, message: '请输入以 http 或 https 开头的网盘地址' };
      }

      const auth = getAuthHeader(user, pass);
      const testUrl = normalizeUrl(url, '');

      // 先尝试前端直接请求 PROPFIND 或 GET
      try {
        const resp = await fetch(testUrl, {
          method: 'PROPFIND',
          headers: {
            'Authorization': auth,
            'Depth': '0',
          },
        });
        if (resp.ok || resp.status === 207 || resp.status === 405) {
          return { ok: true, message: 'WebDAV 网盘连接正常' };
        }
        if (resp.status === 401) {
          return { ok: false, message: '网盘账号或密码错误 (401)' };
        }
      } catch {
        // 如果被浏览器 CORS 拦截，尝试通过 Pages Functions 代理测试
      }

      try {
        const proxyRes = await fetch('/api/webdav', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: testUrl,
            method: 'GET',
            authHeader: auth,
          }),
        });
        if (proxyRes.ok) {
          const resJson = await proxyRes.json();
          if (resJson.ok || resJson.status === 200 || resJson.status === 207) {
            return { ok: true, message: 'WebDAV 网盘连接正常 (通过中继)' };
          }
          if (resJson.status === 401) {
            return { ok: false, message: '网盘账号或密码错误 (401)' };
          }
        }
      } catch {}

      return { ok: false, message: '无法连接到该 WebDAV 服务器，请检查地址与网络' };
    },

    // 2. 上传备份数据
    async uploadBackup(config, payload) {
      const { url, user, pass, filename = 'worklog-backup.json' } = config;
      if (!url) return { ok: false, message: '未配置 WebDAV 地址' };

      const fileUrl = normalizeUrl(url, filename);
      const auth = getAuthHeader(user, pass);
      const jsonContent = JSON.stringify(payload, null, 2);

      // 尝试直连 PUT
      try {
        const resp = await fetch(fileUrl, {
          method: 'PUT',
          headers: {
            'Authorization': auth,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: jsonContent,
        });
        if (resp.ok || resp.status === 201 || resp.status === 204) {
          return { ok: true, message: '已成功备份到 WebDAV 网盘' };
        }
        if (resp.status === 401) {
          return { ok: false, message: '网盘认证失败，请检查账号密码' };
        }
      } catch {}

      // 回落中继 PUT
      try {
        const proxyRes = await fetch('/api/webdav', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: fileUrl,
            method: 'PUT',
            authHeader: auth,
            content: jsonContent,
          }),
        });
        if (proxyRes.ok) {
          const resJson = await proxyRes.json();
          if (resJson.ok || resJson.status === 200 || resJson.status === 201 || resJson.status === 204) {
            return { ok: true, message: '已成功备份到 WebDAV 网盘 (通过中继)' };
          }
          return { ok: false, message: resJson.error || '网盘保存失败' };
        }
      } catch {}

      return { ok: false, message: '保存失败，请检查网盘状态与权限' };
    },

    // 3. 从网盘读取备份
    async downloadBackup(config) {
      const { url, user, pass, filename = 'worklog-backup.json' } = config;
      if (!url) return { ok: false, message: '未配置 WebDAV 地址' };

      const fileUrl = normalizeUrl(url, filename);
      const auth = getAuthHeader(user, pass);

      // 尝试直连 GET
      try {
        const resp = await fetch(fileUrl, {
          method: 'GET',
          headers: { 'Authorization': auth },
        });
        if (resp.ok) {
          const data = await resp.json();
          return { ok: true, data, message: '成功读取网盘备份' };
        }
        if (resp.status === 404) {
          return { ok: false, message: '网盘中暂无备份文件' };
        }
      } catch {}

      // 回落中继 GET
      try {
        const proxyRes = await fetch('/api/webdav', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: fileUrl,
            method: 'GET',
            authHeader: auth,
          }),
        });
        if (proxyRes.ok) {
          const resJson = await proxyRes.json();
          if (resJson.ok && resJson.data) {
            const parsed = JSON.parse(resJson.data);
            return { ok: true, data: parsed, message: '成功读取网盘备份 (通过中继)' };
          }
          if (resJson.status === 404) {
            return { ok: false, message: '网盘中暂无备份文件' };
          }
        }
      } catch {}

      return { ok: false, message: '读取网盘备份失败，请检查地址或凭据' };
    },
  };

  root.WebDAVClient = WebDAVClient;
})(typeof window !== 'undefined' ? window : global);
