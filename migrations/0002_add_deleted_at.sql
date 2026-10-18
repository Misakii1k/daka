-- 0002: 为打卡记录增加墓碑时间，支持跨设备删除同步
-- 适用于已经执行过 schema.sql 旧版本的 D1 数据库。

ALTER TABLE worklog_records ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0;
