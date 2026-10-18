-- Cloudflare D1 工时打卡数据库表结构
-- 严格规范：绝不使用任何 emoji

-- 1. 用户打卡记录表
CREATE TABLE IF NOT EXISTS worklog_records (
  user_id TEXT NOT NULL DEFAULT 'default_user',
  date_key TEXT NOT NULL,
  in_time TEXT,
  out_time TEXT,
  lunch_minutes INTEGER DEFAULT 60,
  lunch_start TEXT,
  lunch_end TEXT,
  note TEXT,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date_key)
);

-- 2. 用户个性化配置表
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY DEFAULT 'default_user',
  user_name TEXT,
  wage_rate REAL DEFAULT 30,
  std_hours REAL DEFAULT 8,
  lunch_minutes INTEGER DEFAULT 60,
  routine_in TEXT DEFAULT '08:30',
  routine_out TEXT DEFAULT '17:30',
  hw_speed TEXT DEFAULT 'fast',
  celebration_fx TEXT DEFAULT 'confetti',
  theme_mode TEXT DEFAULT 'system',
  text_size TEXT DEFAULT 'standard',
  haptic_enabled INTEGER DEFAULT 1,
  reminder_in_enabled INTEGER DEFAULT 1,
  reminder_in_time TEXT DEFAULT '08:20',
  reminder_out_enabled INTEGER DEFAULT 1,
  reminder_out_time TEXT DEFAULT '17:30',
  updated_at INTEGER NOT NULL
);

-- 3. 推送与打卡提醒订阅表
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default_user',
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT,
  auth TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_worklog_date ON worklog_records(user_id, date_key);
