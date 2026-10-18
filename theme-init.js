// 首屏主题初始化：在 CSS 绘制前应用用户显式选择的深色/浅色，避免闪白。
// 严格规范：绝不使用任何 emoji
(function () {
  try {
    var raw = localStorage.getItem('worklog-settings');
    var settings = raw ? JSON.parse(raw) : {};
    var mode = (settings && settings.themeMode) || 'system';
    var resolved = mode;
    if (mode !== 'light' && mode !== 'dark') {
      resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0a0f1d' : '#ffffff');
  } catch (e) {}
})();
