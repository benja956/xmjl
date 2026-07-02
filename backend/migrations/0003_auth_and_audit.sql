-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 创建审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 预置一个默认管理员账号 admin，密码为 admin123 的 SHA-256 哈希值
-- "admin123" 的 SHA-256 哈希值为: 240aa26b5936583137502e9f55d0822a4122d5457a24a20366b5b6e7534d7dff
INSERT OR IGNORE INTO users (username, password) 
VALUES ('admin', '240aa26b5936583137502e9f55d0822a4122d5457a24a20366b5b6e7534d7dff');
