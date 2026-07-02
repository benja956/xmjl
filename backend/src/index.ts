import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// 启用 CORS，允许前端开发与生产环境跨域访问
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

// ==========================================
// 1. 项目经理接口 (Managers CRUD)
// ==========================================

// 获取经理列表（支持筛选）
app.get('/api/managers', async (c) => {
  try {
    const q = c.req.query('q');
    const cert_major = c.req.query('cert_major');
    const title = c.req.query('title');
    const safety_cert = c.req.query('safety_cert');
    const status = c.req.query('status'); // 'idle' (空闲) | 'locked' (锁定)

    let sql = `
      SELECT pm.*, 
             (SELECT COUNT(*) FROM projects p WHERE p.manager_name = pm.name) as project_count,
             (SELECT COUNT(*) FROM projects p WHERE p.manager_name = pm.name AND (p.filing_status = '备案中' OR p.duration LIKE '%在建%' OR p.duration LIKE '%至今%')) as locked_count
      FROM project_managers pm
    `;
    
    const conditions: string[] = [];
    const params: any[] = [];

    if (q) {
      conditions.push('pm.name LIKE ?');
      params.push(`%${q}%`);
    }
    if (cert_major) {
      conditions.push('pm.cert_major LIKE ?');
      params.push(`%${cert_major}%`);
    }
    if (title) {
      conditions.push('pm.title = ?');
      params.push(title);
    }
    if (safety_cert) {
      conditions.push('pm.safety_cert = ?');
      params.push(safety_cert);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY pm.id DESC';

    const stmt = c.env.DB.prepare(sql).bind(...params);
    const { results } = await stmt.all();

    // 内存过滤人员状态 (空闲/锁定)
    let processed = results.map((row: any) => {
      const isLocked = row.locked_count > 0;
      return {
        ...row,
        status: isLocked ? 'locked' : 'idle',
      };
    });

    if (status) {
      processed = processed.filter((row: any) => row.status === status);
    }

    return c.json(processed);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 新增项目经理
app.post('/api/managers', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      title?: string;
      title_major?: string;
      cert_name?: string;
      cert_major?: string;
      safety_cert?: string;
      memo?: string;
    }>();

    if (!body.name) {
      return c.json({ error: 'Name is required' }, 400);
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO project_managers (name, title, title_major, cert_name, cert_major, safety_cert, memo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.name.trim(),
        body.title || '',
        body.title_major || '',
        body.cert_name || '一级建造师',
        body.cert_major || '',
        body.safety_cert || '无',
        body.memo || ''
      )
      .run();

    return c.json({ success: true, id: result.meta.last_row_id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 编辑项目经理信息
app.put('/api/managers/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      name: string;
      title?: string;
      title_major?: string;
      cert_name?: string;
      cert_major?: string;
      safety_cert?: string;
      memo?: string;
    }>();

    if (!body.name) {
      return c.json({ error: 'Name is required' }, 400);
    }

    // 先查出老姓名以更新其关联的业绩姓名（外键级联）
    const oldManager = await c.env.DB.prepare('SELECT name FROM project_managers WHERE id = ?')
      .bind(id)
      .first<{ name: string }>();

    if (!oldManager) {
      return c.json({ error: 'Manager not found' }, 404);
    }

    // 开启数据库级联更新：修改经理名字
    await c.env.DB.prepare(
      `UPDATE project_managers 
       SET name = ?, title = ?, title_major = ?, cert_name = ?, cert_major = ?, safety_cert = ?, memo = ?
       WHERE id = ?`
    )
      .bind(
        body.name.trim(),
        body.title || '',
        body.title_major || '',
        body.cert_name || '一级建造师',
        body.cert_major || '',
        body.safety_cert || '无',
        body.memo || '',
        id
      )
      .run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 删除项目经理
app.delete('/api/managers/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM project_managers WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});


// ==========================================
// 2. 工程业绩接口 (Projects CRUD & View)
// ==========================================

// 获取所有业绩（用于项目视图，附带项目经理的空闲状态）
app.get('/api/projects', async (c) => {
  try {
    const q = c.req.query('q');
    const role = c.req.query('role');
    const record_status = c.req.query('record_status');
    const manager_status = c.req.query('manager_status'); // 'idle' (空闲) | 'locked' (锁定)

    let sql = `
      SELECT p.*,
             (SELECT COUNT(*) FROM projects p2 WHERE p2.manager_name = p.manager_name AND (p2.filing_status = '备案中' OR p2.duration LIKE '%在建%' OR p2.duration LIKE '%至今%')) as manager_locked_count
      FROM projects p
    `;
    
    const conditions: string[] = [];
    const params: any[] = [];

    if (q) {
      conditions.push('(p.project_name LIKE ? OR p.manager_name LIKE ?)');
      params.push(`%${q}%`);
      params.push(`%${q}%`);
    }
    if (role) {
      conditions.push('p.role = ?');
      params.push(role);
    }
    if (record_status) {
      conditions.push('p.record_status LIKE ?');
      params.push(`%${record_status}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY p.id DESC';

    const { results } = await c.env.DB.prepare(sql).bind(...params).all();

    // 内存处理项目关联经理的空闲状态
    let processed = results.map((row: any) => {
      const isLocked = row.manager_locked_count > 0;
      return {
        ...row,
        manager_status: isLocked ? 'locked' : 'idle',
      };
    });

    if (manager_status) {
      processed = processed.filter((row: any) => row.manager_status === manager_status);
    }

    return c.json(processed);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 获取指定项目经理的全部业绩
app.get('/api/managers/:name/projects', async (c) => {
  try {
    const name = c.req.param('name');
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE manager_name = ? ORDER BY id DESC'
    )
      .bind(name)
      .all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 新增工程业绩
app.post('/api/projects', async (c) => {
  try {
    const body = await c.req.json<{
      manager_name: string;
      project_name: string;
      role?: string;
      area?: string;
      amount?: string;
      duration?: string;
      record_status?: string;
      filing_status?: string;
      filing_post?: string;
      filing_start?: string;
      filing_end?: string;
    }>();

    if (!body.manager_name || !body.project_name) {
      return c.json({ error: 'Manager name and project name are required' }, 400);
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO projects (manager_name, project_name, role, area, amount, duration, record_status, filing_status, filing_post, filing_start, filing_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.manager_name.trim(),
        body.project_name.trim(),
        body.role || '',
        body.area || '',
        body.amount || '',
        body.duration || '',
        body.record_status || '',
        body.filing_status || '',
        body.filing_post || '',
        body.filing_start || '',
        body.filing_end || ''
      )
      .run();

    return c.json({ success: true, id: result.meta.last_row_id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 编辑工程业绩
app.put('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      project_name: string;
      role?: string;
      area?: string;
      amount?: string;
      duration?: string;
      record_status?: string;
      filing_status?: string;
      filing_post?: string;
      filing_start?: string;
      filing_end?: string;
    }>();

    if (!body.project_name) {
      return c.json({ error: 'Project name is required' }, 400);
    }

    await c.env.DB.prepare(
      `UPDATE projects 
       SET project_name = ?, role = ?, area = ?, amount = ?, duration = ?, record_status = ?, filing_status = ?, filing_post = ?, filing_start = ?, filing_end = ?
       WHERE id = ?`
    )
      .bind(
        body.project_name.trim(),
        body.role || '',
        body.area || '',
        body.amount || '',
        body.duration || '',
        body.record_status || '',
        body.filing_status || '',
        body.filing_post || '',
        body.filing_start || '',
        body.filing_end || '',
        id
      )
      .run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 删除工程业绩
app.delete('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// 3. 统计看板数据接口 (Metrics)
// ==========================================
app.get('/api/stats', async (c) => {
  try {
    // 1. 项目经理总数
    const managersCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM project_managers'
    ).first<{ count: number }>();

    // 2. 业绩总合同金额 (提取数字并求和)
    // D1/SQLite 可以使用带有 CAST 的简单方法，但在内存中累加最稳妥
    const allProjects = await c.env.DB.prepare('SELECT amount FROM projects').all();
    let totalAmount = 0;
    allProjects.results.forEach((row: any) => {
      const match = strToNum(row.amount);
      totalAmount += match;
    });

    // 3. 计算锁定和空闲经理数
    const managersStatus = await c.env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM projects p WHERE p.manager_name = pm.name AND (p.filing_status = '备案中' OR p.duration LIKE '%在建%' OR p.duration LIKE '%至今%')) as locked_count
      FROM project_managers pm
    `).all();
    
    let lockedCount = 0;
    managersStatus.results.forEach((row: any) => {
      if (row.locked_count > 0) lockedCount++;
    });
    const idleCount = (managersCount?.count || 0) - lockedCount;

    // 4. 即将到期备案警报数 (30天内到期)
    const todayStr = new Date().toISOString().slice(0, 10);
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    
    const nearExpiry = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM projects 
       WHERE filing_status = '备案中' AND filing_end != '' AND filing_end >= ? AND filing_end <= ?`
    )
      .bind(todayStr, thirtyDaysLater)
      .first<{ count: number }>();

    return c.json({
      total_managers: managersCount?.count || 0,
      total_amount_万元: Math.round(totalAmount),
      locked_managers: lockedCount,
      idle_managers: idleCount,
      near_expiry: nearExpiry?.count || 0,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 辅助函数：从金额字符串提取数字（如 "138531万元" -> 138531）
function strToNum(str: string): number {
  if (!str) return 0;
  const match = str.match(/[\d\.]+/);
  if (match) {
    return parseFloat(match[0]);
  }
  return 0;
}

export default app;
