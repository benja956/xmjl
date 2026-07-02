-- Migration number: 0002_create_xmjl_tables.sql
CREATE TABLE IF NOT EXISTS project_managers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    title TEXT,
    title_major TEXT,
    cert_name TEXT,
    cert_major TEXT,
    safety_cert TEXT,
    memo TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manager_name TEXT NOT NULL,
    project_name TEXT NOT NULL,
    role TEXT,
    area TEXT,
    amount TEXT,
    duration TEXT,
    record_status TEXT,
    filing_status TEXT,
    filing_post TEXT,
    filing_start TEXT,
    filing_end TEXT,
    FOREIGN KEY (manager_name) REFERENCES project_managers(name) ON UPDATE CASCADE ON DELETE CASCADE
);
