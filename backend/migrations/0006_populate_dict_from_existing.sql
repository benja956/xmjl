-- Migration: Populate dictionary_data from existing project_managers and projects records

-- 1. 从现有的经理注册执业专业子表中提取并注入
INSERT OR IGNORE INTO dictionary_data (type, value)
SELECT DISTINCT 'cert_major', major 
FROM manager_cert_majors 
WHERE major IS NOT NULL AND major != '';

-- 2. 从现有的经理职称专业字段中提取并注入
INSERT OR IGNORE INTO dictionary_data (type, value)
SELECT DISTINCT 'title_major', title_major 
FROM project_managers 
WHERE title_major IS NOT NULL AND title_major != '';

-- 3. 从现有的经理职称等级字段中提取并注入
INSERT OR IGNORE INTO dictionary_data (type, value)
SELECT DISTINCT 'title', title 
FROM project_managers 
WHERE title IS NOT NULL AND title != '';

-- 4. 从现有的参建岗位业绩字段中提取并注入
INSERT OR IGNORE INTO dictionary_data (type, value)
SELECT DISTINCT 'role', role 
FROM projects 
WHERE role IS NOT NULL AND role != '';
