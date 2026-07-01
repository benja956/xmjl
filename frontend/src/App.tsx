import { useState, useEffect } from 'react';
import './App.css';

interface Message {
  id: number;
  name: string;
  content: string;
  created_at: string;
}

// 自动根据开发或生产环境决定 API 基准路径
const API_BASE = import.meta.env.DEV
  ? 'http://localhost:8787'
  : window.location.host.endsWith('pages.dev')
  ? 'https://backend.benja956.workers.dev' // 临时兼容：在 Cloudflare 默认域名下预览时，直接指向您的 Worker 默认域名
  : `${window.location.protocol}//api.${window.location.host.replace(/^www\./, '')}`;

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取留言
  const fetchMessages = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/messages`);
      if (!res.ok) {
        throw new Error('无法加载留言列表');
      }
      const data = (await res.json()) as Message[];
      setMessages(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || '网络请求错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  // 提交留言
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          content: content.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('提交留言失败');
      }

      setName('');
      setContent('');
      await fetchMessages();
    } catch (err: any) {
      setError(err.message || '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 删除留言
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条留言吗？')) return;

    try {
      const res = await fetch(`${API_BASE}/api/messages/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('删除留言失败');
      }

      await fetchMessages();
    } catch (err: any) {
      setError(err.message || '删除失败，请重试');
    }
  };

  return (
    <div className="container">
      {/* 炫酷的渐变背景光圈 */}
      <div className="glow-circle glowing-blue"></div>
      <div className="glow-circle glowing-purple"></div>

      <header className="header">
        <h1 className="title">极简光影留言板</h1>
        <p className="subtitle">
          基于 Cloudflare Pages + Workers + D1 数据库的前后端分离实践
        </p>
      </header>

      <main className="main-content">
        {/* 表单卡片 */}
        <section className="card form-card">
          <h2 className="section-title">撰写留言</h2>
          <form onSubmit={handleSubmit} className="guestbook-form">
            <div className="form-group">
              <label htmlFor="name-input">您的昵称</label>
              <input
                id="name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入昵称"
                maxLength={20}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="content-input">留言内容</label>
              <textarea
                id="content-input"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="分享您的想法..."
                maxLength={200}
                rows={4}
                required
              ></textarea>
            </div>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !content.trim()}
              className="submit-btn"
            >
              {submitting ? '提交中...' : '发送留言'}
            </button>
          </form>
          {error && <div className="error-message">{error}</div>}
        </section>

        {/* 留言列表展示 */}
        <section className="card list-card">
          <div className="list-header">
            <h2 className="section-title">留言墙</h2>
            <button
              onClick={fetchMessages}
              disabled={loading}
              className="refresh-btn"
              title="刷新留言"
            >
              {loading ? '🔄' : '↻'} 刷新
            </button>
          </div>

          {loading && messages.length === 0 ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>正在读取留言墙...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✍️</span>
              <p>留言墙还空空如也，来做第一个留言的人吧！</p>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((msg) => (
                <div key={msg.id} className="message-item">
                  <div className="message-header">
                    <span className="user-name">{msg.name}</span>
                    <span className="message-date">
                      {new Date(msg.created_at).toLocaleString('zh-CN', {
                        hour12: false,
                      })}
                    </span>
                  </div>
                  <p className="message-body">{msg.content}</p>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(msg.id)}
                    title="删除留言"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>Antigravity Pair Programming Project</p>
      </footer>
    </div>
  );
}

export default App;
