// 首屏主题初始化：在 CSS 绘制前应用用户显式选择的深色/浅色，避免闪白。
// 严格规范：绝不使用任何 emoji
(function () {
  try {
    var raw = localStorage.getItem('worklog-settings');
    if (!raw) return;
    var settings = JSON.parse(raw);
    var mode = settings && settings.themeMode;
    if (mode === 'dark' || mode === 'light') {
      document.documentElement.setAttribute('data-theme', mode);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', mode === 'dark' ? '#0a0f1d' : '#ffffff');
    }
  } catch (e) {}
})();
