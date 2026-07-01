import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// 启用 CORS 中间件，允许开发环境跨域访问
app.use(
  '/api/*',
  cors({
    origin: '*', // 生产环境下建议指定具体的前端域名，例如 'https://example.com'
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  })
);

// 获取留言列表
app.get('/api/messages', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM messages ORDER BY created_at DESC'
    ).all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 添加留言
app.post('/api/messages', async (c) => {
  try {
    const { name, content } = await c.req.json<{ name: string; content: string }>();
    if (!name || !content) {
      return c.json({ error: 'Name and content are required' }, 400);
    }
    const result = await c.env.DB.prepare(
      'INSERT INTO messages (name, content) VALUES (?, ?)'
    )
      .bind(name, content)
      .run();

    return c.json({ success: true, id: result.meta.last_row_id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 删除留言
app.delete('/api/messages/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
