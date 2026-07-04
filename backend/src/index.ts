import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt, sign } from 'hono/jwt';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();
const JWT_SECRET = 'xmjl-super-secret-key-2026';

let isDbInitialized = false;

// 自动建表与默认数据初始化自愈函数
async function ensureTablesExist(db: D1Database) {
  try {
    // 检查并创建 users 表
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      )
    `).run();

    // 检查并创建 audit_logs 表
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id INTEGER,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      )
    `).run();

    // 确保默认管理员账户存在且密码哈希正确 (admin123)
    const adminHash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
    const adminUser = (await db.prepare('SELECT * FROM users WHERE username = ?').bind('admin').first()) as { password?: string } | null;
    if (!adminUser) {
      await db.prepare('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)')
        .bind('admin', adminHash)
        .run();
      console.log('自动创建并初始化默认 admin 账号完成');
    } else if (adminUser.password === '240aa26b5936583137502e9f55d0822a4122d5457a24a20366b5b6e7534d7dff') {
      await db.prepare('UPDATE users SET password = ? WHERE username = ?')
        .bind(adminHash, 'admin')
        .run();
      console.log('检测到旧的错误密码哈希，已自动重置 admin 密码为 admin123');
    }
  } catch (err) {
    console.error('自动初始化数据库表失败:', err);
  }
}

// 启用 CORS，允许前端开发与生产环境跨域访问（必须允许 Authorization 头部）
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

// 自动初始化数据库中间件
app.use('/api/*', async (c, next) => {
  if (!isDbInitialized) {
    await ensureTablesExist(c.env.DB);
    isDbInitialized = true;
  }
  return next();
});

// SHA-256 密码哈希辅助函数 (无依赖标准实现)
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 审计日志写入辅助函数
async function writeAuditLog(
  db: D1Database,
  userName: string,
  action: string,
  targetId: number | null,
  details: string
) {
  try {
    await db
      .prepare(
        'INSERT INTO audit_logs (user_name, action, target_id, details) VALUES (?, ?, ?, ?)'
      )
      .bind(userName, action, targetId, details)
      .run();
  } catch (err) {
    console.error('写入审计日志失败:', err);
  }
}

// ==========================================
// 1. 鉴权路由与中间件
// ==========================================

// 登录接口 (POST /api/login)
app.post('/api/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || !password) {
      return c.json({ error: '用户名和密码不能为空' }, 400);
    }

    // 强健的自愈逻辑：若系统中没有任何叫 admin 的用户，则直接注入默认 admin；若发现是旧哈希，自动重置。
    try {
      const adminUser = (await c.env.DB.prepare(
        'SELECT * FROM users WHERE username = ?'
      ).bind('admin').first()) as { password?: string } | null;
      
      const adminHash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
      if (!adminUser) {
        await c.env.DB.prepare('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)')
          .bind('admin', adminHash)
          .run();
        console.log('未检测到管理员 admin，已自动初始化默认账户');
      } else if (adminUser.password === '240aa26b5936583137502e9f55d0822a4122d5457a24a20366b5b6e7534d7dff') {
        await c.env.DB.prepare('UPDATE users SET password = ? WHERE username = ?')
          .bind(adminHash, 'admin')
          .run();
        console.log('检测到旧的错误密码哈希，已自动重置 admin 密码为 admin123');
      }
    } catch (dbErr) {
      console.warn('检查或自动创建用户失败:', dbErr);
    }

    const hash = await sha256(password);
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE username = ? AND password = ?'
    )
      .bind(username, hash)
      .first();

    if (!user) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    // 签发 JWT (有效期 24 小时)
    const payload = {
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    };
    const token = await sign(payload, JWT_SECRET);

    // 记录登录审计
    await writeAuditLog(c.env.DB, user.username as string, 'USER_LOGIN', null, `用户 ${user.username} 成功登录系统`);

    return c.json({ token, username: user.username });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// JWT 权限拦截中间件 (除登录接口外的所有 /api/* 请求)
app.use('/api/*', (c, next) => {
  // 更加鲁棒的放行匹配，兼容不同基础路径代理
  if (c.req.path === '/api/login' || c.req.path.endsWith('/login') || c.req.method === 'OPTIONS') {
    return next();
  }
  return jwt({ secret: JWT_SECRET, alg: 'HS256' })(c, next);
});

// ==========================================
// 2. 审计日志查询接口
// ==========================================

// 获取系统最近 50 条审计日志
app.get('/api/logs', async (c) => {
  try {
    const logs = await c.env.DB.prepare(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50'
    ).all();
    return c.json(logs.results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// 3. 项目经理接口 (Managers CRUD)
// ==========================================

// 获取经理列表（支持筛选）
app.get('/api/managers', async (c) => {
  try {
    const q = c.req.query('q');
    const cert_major = c.req.query('cert_major');
    const title = c.req.query('title');
    const safety_cert = c.req.query('safety_cert');

    let sql = `
      SELECT 
        pm.*,
        GROUP_CONCAT(DISTINCT cm.major) as cert_major,
        COUNT(DISTINCT p.id) as project_count,
        COUNT(DISTINCT CASE WHEN p.filing_status = '备案中' OR p.end_date IS NULL THEN p.id ELSE NULL END) as locked_count
      FROM project_managers pm
      LEFT JOIN manager_cert_majors cm ON pm.name = cm.manager_name
      LEFT JOIN projects p ON pm.name = p.manager_name
    `;

    const whereConditions: string[] = [];
    const params: any[] = [];

    if (q) {
      whereConditions.push('(pm.name LIKE ? OR pm.memo LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (cert_major) {
      whereConditions.push('EXISTS (SELECT 1 FROM manager_cert_majors WHERE manager_name = pm.name AND major = ?)');
      params.push(cert_major);
    }
    if (title) {
      whereConditions.push('pm.title LIKE ?');
      params.push(`%${title}%`);
    }
    if (safety_cert && safety_cert !== 'all') {
      whereConditions.push('pm.safety_cert = ?');
      params.push(safety_cert);
    }

    if (whereConditions.length > 0) {
      sql += ' WHERE ' + whereConditions.join(' AND ');
    }

    sql += ' GROUP BY pm.name ORDER BY pm.name ASC';

    const stmt = c.env.DB.prepare(sql).bind(...params);
    const { results } = await stmt.all();

    // 映射状态：若 locked_count > 0，则该经理被锁定，否则空闲 (idle)
    const formatted = results.map((row: any) => ({
      ...row,
      status: Number(row.locked_count || 0) > 0 ? 'locked' : 'idle',
    }));

    return c.json(formatted);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 新增项目经理
app.post('/api/managers', async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name) return c.json({ error: '姓名不能为空' }, 400);

    const payload = c.get('jwtPayload') as { username: string };
    const currentUser = payload.username;

    // 职称发证日期分列处理
    let titleMajor = body.title_major || '';
    let titleDate = body.title_date || null;
    
    // 后备兼容性提取
    if (titleMajor && !titleDate) {
      const match = titleMajor.trim().match(/(\d{4}\.\d{1,2}\.\d{1,2})$/);
      if (match) {
        titleDate = match[1].replace(/\./g, '-');
        titleMajor = titleMajor.substring(0, match.index).trim();
      }
    }

    await c.env.DB.prepare(
      'INSERT INTO project_managers (name, title, title_major, title_date, cert_name, safety_cert, memo) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        body.name,
        body.title || '',
        titleMajor,
        titleDate,
        body.cert_name || '一级建造师',
        body.safety_cert || '无',
        body.memo || ''
      )
      .run();

    // 写入展平的注册专业子表
    if (body.cert_major) {
      const majors = body.cert_major.split(',').map((m: string) => m.trim()).filter(Boolean);
      for (const major of majors) {
        await c.env.DB.prepare(
          'INSERT INTO manager_cert_majors (manager_name, major) VALUES (?, ?)'
        )
          .bind(body.name, major)
          .run();
      }
    }

    await writeAuditLog(c.env.DB, currentUser, 'ADD_MANAGER', null, `新增项目经理: ${body.name}`);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 修改项目经理基本信息 (oldName 作为 URL 参数)
app.put('/api/managers/:oldName', async (c) => {
  try {
    const oldName = c.req.param('oldName');
    const body = await c.req.json();
    if (!body.name) return c.json({ error: '姓名不能为空' }, 400);

    const payload = c.get('jwtPayload') as { username: string };
    const currentUser = payload.username;

    // 职称发证日期分列处理
    let titleMajor = body.title_major || '';
    let titleDate = body.title_date || null;
    
    if (titleMajor && !titleDate) {
      const match = titleMajor.trim().match(/(\d{4}\.\d{1,2}\.\d{1,2})$/);
      if (match) {
        titleDate = match[1].replace(/\./g, '-');
        titleMajor = titleMajor.substring(0, match.index).trim();
      }
    }

    // 1. 删除旧的注册专业关联
    await c.env.DB.prepare('DELETE FROM manager_cert_majors WHERE manager_name = ?')
      .bind(oldName)
      .run();

    // 2. 插入新的注册专业关联
    if (body.cert_major) {
      const majors = body.cert_major.split(',').map((m: string) => m.trim()).filter(Boolean);
      for (const major of majors) {
        await c.env.DB.prepare(
          'INSERT INTO manager_cert_majors (manager_name, major) VALUES (?, ?)'
        )
          .bind(body.name, major)
          .run();
      }
    }

    // 3. 更新主表项目经理 (支持修改姓名，由 ON UPDATE CASCADE 级联更新外键)
    await c.env.DB.prepare(
      'UPDATE project_managers SET name = ?, title = ?, title_major = ?, title_date = ?, cert_name = ?, safety_cert = ?, memo = ? WHERE name = ?'
    )
      .bind(
        body.name,
        body.title || '',
        titleMajor,
        titleDate,
        body.cert_name || '一级建造师',
        body.safety_cert || '无',
        body.memo || '',
        oldName
      )
      .run();

    await writeAuditLog(c.env.DB, currentUser, 'EDIT_MANAGER', null, `更新项目经理信息: ${body.name}`);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 删除项目经理 (级联删除关联的所有业绩项目和专业)
app.delete('/api/managers/:name', async (c) => {
  try {
    const name = c.req.param('name');
    const payload = c.get('jwtPayload') as { username: string };
    const currentUser = payload.username;

    await c.env.DB.prepare('DELETE FROM project_managers WHERE name = ?').bind(name).run();
    await writeAuditLog(c.env.DB, currentUser, 'DELETE_MANAGER', null, `删除项目经理: ${name} 及其关联的所有业绩与专业`);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 获取特定项目经理关联的所有代表项目
app.get('/api/managers/:name/projects', async (c) => {
  try {
    const name = c.req.param('name');
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE manager_name = ? ORDER BY (end_date IS NULL) DESC, end_date DESC'
    )
      .bind(name)
      .all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// 4. 项目管理接口 (Projects CRUD)
// ==========================================

// 获取全量工程项目列表（自动联查负责人的当前可用状态）
app.get('/api/projects', async (c) => {
  try {
    const q = c.req.query('q');
    const role = c.req.query('role');
    const record_status = c.req.query('record_status');

    let sql = `
      SELECT 
        p.*,
        (
          SELECT COUNT(inner_p.id)
          FROM projects inner_p
          WHERE inner_p.manager_name = p.manager_name
            AND (inner_p.filing_status = '备案中' OR inner_p.end_date IS NULL)
        ) as manager_locked_count
      FROM projects p
      LEFT JOIN project_managers pm ON p.manager_name = pm.name
    `;

    const whereConditions: string[] = [];
    const params: any[] = [];

    if (q) {
      whereConditions.push('(p.project_name LIKE ? OR p.manager_name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (role && role !== 'all') {
      whereConditions.push('p.role = ?');
      params.push(role);
    }
    if (record_status && record_status !== 'all') {
      whereConditions.push('p.record_status LIKE ?');
      params.push(`%${record_status}%`);
    }

    if (whereConditions.length > 0) {
      sql += ' WHERE ' + whereConditions.join(' AND ');
    }

    // 优先将在建项目 (end_date IS NULL) 排序在最上方，接着按竣工时间倒序
    sql += ' ORDER BY (p.end_date IS NULL) DESC, p.end_date DESC, p.id DESC';

    const { results } = await c.env.DB.prepare(sql).bind(...params).all();

    // 格式化输出经理的状态
    const formatted = results.map((row: any) => ({
      ...row,
      manager_status: Number(row.manager_locked_count || 0) > 0 ? 'locked' : 'idle',
    }));

    return c.json(formatted);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 增加工程业绩
app.post('/api/projects', async (c) => {
  try {
    const body = await c.req.json();
    if (!body.manager_name || !body.project_name) {
      return c.json({ error: '负责人姓名与项目名称不能为空' }, 400);
    }

    const payload = c.get('jwtPayload') as { username: string };
    const currentUser = payload.username;

    const result = await c.env.DB.prepare(
      'INSERT INTO projects (manager_name, project_name, role, area, amount, start_date, end_date, record_status, filing_status, filing_post, filing_start, filing_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        body.manager_name,
        body.project_name,
        body.role || '项目经理',
        body.area || '',
        body.amount || '',
        body.start_date || null,
        body.end_date || null,
        body.record_status || '无',
        body.filing_status || '',
        body.filing_post || '',
        body.filing_start || null,
        body.filing_end || null
      )
      .run();

    const newId = result.meta.last_row_id ? Number(result.meta.last_row_id) : null;
    await writeAuditLog(
      c.env.DB,
      currentUser,
      'ADD_PROJECT',
      newId,
      `为经理 ${body.manager_name} 登记代表业绩: ${body.project_name}`
    );

    return c.json({ success: true, id: newId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 修改工程业绩信息
app.put('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    if (!body.project_name) return c.json({ error: '项目名称不能为空' }, 400);

    const payload = c.get('jwtPayload') as { username: string };
    const currentUser = payload.username;

    await c.env.DB.prepare(
      'UPDATE projects SET project_name = ?, role = ?, area = ?, amount = ?, start_date = ?, end_date = ?, record_status = ?, filing_status = ?, filing_post = ?, filing_start = ?, filing_end = ? WHERE id = ?'
    )
      .bind(
        body.project_name,
        body.role || '项目经理',
        body.area || '',
        body.amount || '',
        body.start_date || null,
        body.end_date || null,
        body.record_status || '无',
        body.filing_status || '',
        body.filing_post || '',
        body.filing_start || null,
        body.filing_end || null,
        id
      )
      .run();

    await writeAuditLog(c.env.DB, currentUser, 'EDIT_PROJECT', Number(id), `更新工程业绩信息: ${body.project_name}`);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 删除工程业绩
app.delete('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const payload = c.get('jwtPayload') as { username: string };
    const currentUser = payload.username;

    const proj = await c.env.DB.prepare('SELECT project_name, manager_name FROM projects WHERE id = ?')
      .bind(id)
      .first();

    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();

    const detailStr = proj
      ? `删除 ${proj.manager_name} 关联的业绩: ${proj.project_name}`
      : `删除业绩记录 ID ${id}`;

    await writeAuditLog(c.env.DB, currentUser, 'DELETE_PROJECT', Number(id), detailStr);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// 5. 仪表盘统计接口 (Dashboard stats)
// ==========================================
app.get('/api/stats', async (c) => {
  try {
    // 1. 人员总数
    const countRes = (await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM project_managers'
    ).first()) as any;

    // 2. 项目累计合同金额 (转换 万元 进行求和)
    const projectsList = (await c.env.DB.prepare(
      'SELECT amount FROM projects'
    ).all()) as any;

    let totalAmount = 0;
    projectsList.results.forEach((row: any) => {
      if (row.amount) {
        const match = row.amount.match(/[\d\.]+/);
        if (match) {
          totalAmount += parseFloat(match[0]);
        }
      }
    });

    // 3. 锁定经理与空闲经理人数计算
    const lockStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(name) as total_mgr,
        SUM(CASE WHEN locked_count > 0 THEN 1 ELSE 0 END) as locked_mgr
      FROM (
        SELECT 
          pm.name,
          COUNT(CASE WHEN p.filing_status = '备案中' OR p.end_date IS NULL THEN p.id ELSE NULL END) as locked_count
        FROM project_managers pm
        LEFT JOIN projects p ON pm.name = p.manager_name
        GROUP BY pm.name
      )
    `).first() as any;

    const totalManagers = countRes?.total || 0;
    const lockedManagers = lockStats?.locked_mgr || 0;
    const idleManagers = totalManagers - lockedManagers;

    // 4. 备案到期预警：备案状态为备案中，且截止日期在 30 天以内的项目数量
    const expiryRes = await c.env.DB.prepare(`
      SELECT COUNT(*) as near_expiry 
      FROM projects 
      WHERE filing_status = '备案中' 
        AND filing_end IS NOT NULL 
        AND filing_end != ''
        AND date(filing_end) <= date('now', '+30 days')
    `).first() as any;

    return c.json({
      total_managers: totalManagers,
      total_amount_万元: totalAmount,
      locked_managers: lockedManagers,
      idle_managers: idleManagers >= 0 ? idleManagers : 0,
      near_expiry: expiryRes?.near_expiry || 0,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
