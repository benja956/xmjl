import { useState, useEffect } from 'react';
import './App.css';

interface Manager {
  id: number;
  name: string;
  title: string;
  title_major: string;
  cert_name: string;
  cert_major: string;
  safety_cert: string;
  memo: string;
  project_count: number;
  locked_count: number;
  status: 'idle' | 'locked';
}

interface Project {
  id: number;
  manager_name: string;
  project_name: string;
  role: string;
  area: string;
  amount: string;
  duration: string;
  record_status: string;
  filing_status: string;
  filing_post: string;
  filing_start: string;
  filing_end: string;
  manager_status: 'idle' | 'locked';
}

interface Stats {
  total_managers: number;
  total_amount_万元: number;
  locked_managers: number;
  idle_managers: number;
  near_expiry: number;
}

interface AuditLog {
  id: number;
  user_name: string;
  action: string;
  target_id: number | null;
  details: string;
  created_at: string;
}

// 自动决定 API 路径
const getApiBase = () => {
  if (import.meta.env.DEV) {
    const port = window.location.port;
    const hostname = window.location.hostname;
    if (port === '5174') return `http://${hostname}:8788`;
    if (port === '5175') return `http://${hostname}:8789`;
    return `http://${hostname}:8787`;
  }
  return window.location.host.endsWith('pages.dev')
    ? 'https://backend.benja956.workers.dev'
    : `${window.location.protocol}//api.${window.location.host.replace(/^www\./, '')}`;
};
const API_BASE = getApiBase();

function App() {
  // ==========================================
  // 鉴权会话状态
  // ==========================================
  const [token, setToken] = useState<string | null>(localStorage.getItem('xmjl_jwt'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('xmjl_username'));

  // 登录表单状态
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // 视图切换: 'manager' (项目经理视图) | 'project' (project 视图)
  const [activeTab, setActiveTab] = useState<'manager' | 'project'>('manager');
  const [activeMenuManagerId, setActiveMenuManagerId] = useState<number | null>(null);

  // 数据列表状态
  const [managers, setManagers] = useState<Manager[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_managers: 0,
    total_amount_万元: 0,
    locked_managers: 0,
    idle_managers: 0,
    near_expiry: 0,
  });

  // 全局加载与错误状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ==========================================
  // 审计日志 Modal 状态
  // ==========================================
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // ==========================================
  // 筛选器状态 (项目经理视图)
  // ==========================================
  const [mgrSearch, setMgrSearch] = useState('');
  const [mgrCertMajor, setMgrCertMajor] = useState(''); // 证书专业
  const [mgrStatus, setMgrStatus] = useState('all'); // all | idle | locked
  const [mgrSafety, setMgrSafety] = useState('all'); // all | A | B | C | 无
  const [mgrMinAmount, setMgrMinAmount] = useState('all'); // all | 3000 | 5000 | 10000 (万元)
  const [mgrMinArea, setMgrMinArea] = useState('all'); // all | 10000 | 30000 | 50000 (㎡)
  const [mgrCompletedIn, setMgrCompletedIn] = useState('all'); // all | 3 | 5 (近3年/5年有竣工项目)

  // ==========================================
  // 筛选器状态 (项目视图)
  // ==========================================
  const [projSearch, setProjSearch] = useState('');
  const [projRole, setProjRole] = useState('all'); // all | 项目经理 | 技术负责人
  const [projRecord, setProjRecord] = useState('all'); // all | 已备案 | 无
  const [projMgrStatus, setProjMgrStatus] = useState('all'); // all | idle | locked
  const [projMinAmount, setProjMinAmount] = useState('all'); // all | 3000 | 5000 | 10000
  const [projMinArea, setProjMinArea] = useState('all'); // all | 10000 | 30000 | 50000
  const [projTimeStatus, setProjTimeStatus] = useState('all'); // all | 在建 | 已竣工

  // ==========================================
  // 增删改查 Modal 状态
  // ==========================================
  const [showMgrModal, setShowMgrModal] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null); // null 代表新增
  const [mgrForm, setMgrForm] = useState({
    name: '',
    title: '',
    title_major: '',
    cert_name: '一级建造师',
    cert_major: '',
    safety_cert: '无',
    memo: '',
  });

  const [showProjModal, setShowProjModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null); // null 代表新增
  const [targetManagerName, setTargetManagerName] = useState(''); // 新增业绩时绑定的经理姓名
  const [projForm, setProjForm] = useState({
    project_name: '',
    role: '项目经理',
    area: '',
    amount: '',
    duration: '',
    record_status: '已备案',
    filing_status: '已备案',
    filing_post: '',
    filing_start: '',
    filing_end: '',
  });

  // ==========================================
  // 统一的带 Token Header 的 Fetch 封装
  // ==========================================
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, { ...options, headers });
  };

  // ==========================================
  // 数据获取逻辑
  // ==========================================
  const fetchAllData = async () => {
    if (!token) return; // 未登录时不请求敏感数据

    try {
      setLoading(true);
      // 1. 获取统计指标
      const statsRes = await fetchWithAuth(`${API_BASE}/api/stats`);
      if (statsRes.status === 401) {
        handleLogout();
        return;
      }
      if (statsRes.ok) setStats(await statsRes.json());

      // 2. 获取经理列表
      const mgrRes = await fetchWithAuth(`${API_BASE}/api/managers`);
      if (mgrRes.ok) setManagers(await mgrRes.json());

      // 3. 获取所有项目列表
      const projRes = await fetchWithAuth(`${API_BASE}/api/projects`);
      if (projRes.ok) setProjects(await projRes.json());

      setError(null);
    } catch (err: any) {
      setError(err.message || '获取数据失败，请检查网络或后端服务');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAllData();
    }
  }, [token]);

  // 点击页面空白处自动收起人名操作菜单
  useEffect(() => {
    const handleCloseMenu = () => setActiveMenuManagerId(null);
    document.addEventListener('click', handleCloseMenu);
    return () => document.removeEventListener('click', handleCloseMenu);
  }, []);

  // ==========================================
  // 鉴权事件处理
  // ==========================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUser.trim() || !loginPass.trim()) return;

    try {
      setLoggingIn(true);
      setLoginError(null);
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '登录失败，请核对账号密码');
      }

      // 保存鉴权会话
      localStorage.setItem('xmjl_jwt', data.token);
      localStorage.setItem('xmjl_username', data.username);
      setToken(data.token);
      setUsername(data.username);
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('xmjl_jwt');
    localStorage.removeItem('xmjl_username');
    setToken(null);
    setUsername(null);
    setManagers([]);
    setProjects([]);
  };

  // 获取审计日志
  const fetchAuditLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await fetchWithAuth(`${API_BASE}/api/logs`);
      if (res.ok) {
        setAuditLogs(await res.json());
      }
    } catch (err) {
      console.error('获取日志失败:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const openLogsModal = () => {
    setShowLogsModal(true);
    fetchAuditLogs();
  };

  // ==========================================
  // 增删改查请求处理
  // ==========================================
  const handleSaveManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mgrForm.name.trim()) return;

    try {
      const isEdit = !!editingManager;
      const url = isEdit
        ? `${API_BASE}/api/managers/${editingManager.id}`
        : `${API_BASE}/api/managers`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mgrForm),
      });

      if (!res.ok) throw new Error('保存人员数据失败');
      
      setShowMgrModal(false);
      await fetchAllData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteManager = async (id: number, name: string) => {
    if (!confirm(`确定要删除项目经理 "${name}" 吗？此操作将同步级联删除他名下的所有项目业绩！`)) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/managers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除人员失败');
      await fetchAllData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projForm.project_name.trim()) return;

    try {
      const isEdit = !!editingProject;
      const url = isEdit
        ? `${API_BASE}/api/projects/${editingProject.id}`
        : `${API_BASE}/api/projects`;
      const method = isEdit ? 'PUT' : 'POST';

      const bodyData = isEdit
        ? projForm
        : { ...projForm, manager_name: targetManagerName };

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
      });

      if (!res.ok) throw new Error('保存业绩数据失败');

      setShowProjModal(false);
      await fetchAllData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteProject = async (projId: number) => {
    if (!confirm('确定要删除这条业绩项目吗？')) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除项目失败');
      await fetchAllData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ==========================================
  // 打开 Modals 辅助函数
  // ==========================================
  const openAddManager = () => {
    setEditingManager(null);
    setMgrForm({
      name: '',
      title: '',
      title_major: '',
      cert_name: '一级建造师',
      cert_major: '',
      safety_cert: '无',
      memo: '',
    });
    setShowMgrModal(true);
  };

  const openEditManager = (mgr: Manager) => {
    setEditingManager(mgr);
    setMgrForm({
      name: mgr.name,
      title: mgr.title,
      title_major: mgr.title_major,
      cert_name: mgr.cert_name,
      cert_major: mgr.cert_major,
      safety_cert: mgr.safety_cert,
      memo: mgr.memo,
    });
    setShowMgrModal(true);
  };

  const openAddProject = (mgrName: string) => {
    setEditingProject(null);
    setTargetManagerName(mgrName);
    setProjForm({
      project_name: '',
      role: '项目经理',
      area: '',
      amount: '',
      duration: '',
      record_status: '已备案',
      filing_status: '已备案',
      filing_post: '',
      filing_start: '',
      filing_end: '',
    });
    setShowProjModal(true);
  };

  const openEditProject = (proj: Project) => {
    setEditingProject(proj);
    setProjForm({
      project_name: proj.project_name,
      role: proj.role,
      area: proj.area,
      amount: proj.amount,
      duration: proj.duration,
      record_status: proj.record_status,
      filing_status: proj.filing_status,
      filing_post: proj.filing_post,
      filing_start: proj.filing_start || '',
      filing_end: proj.filing_end || '',
    });
    setShowProjModal(true);
  };

  // 职务/岗位简称
  const getRoleAbbr = (role: string) => {
    if (role === '项目经理') return '项';
    if (role === '技术负责人') return '技';
    return role ? role.slice(0, 1) : '他';
  };

  // 证书专业简称 (建筑->建, 市政->市)
  const getCertMajorAbbr = (managerName: string) => {
    const mgr = managers.find(m => m.name === managerName);
    if (!mgr || !mgr.cert_major) return '—';
    const parts: string[] = [];
    if (mgr.cert_major.includes('建筑')) parts.push('建');
    if (mgr.cert_major.includes('市政')) parts.push('市');
    return parts.length > 0 ? parts.join('/') : '—';
  };

  // 渲染注册专业字标方块（如：建筑工程->建，支持多专业并排）
  const renderCertMajorBadges = (certMajor: string | null) => {
    if (!certMajor) return <span className="text-muted">—</span>;
    const majors = certMajor.split(/[,,;；\s\n]+/).map(s => s.trim()).filter(Boolean);
    if (majors.length === 0) return <span className="text-muted">—</span>;

    return (
      <div className="d-flex flex-wrap gap-1">
        {majors.map((m, idx) => {
          let char = m.slice(0, 1);
          let bgColor = '#f1f5f9';
          let textColor = '#475569';
          
          if (m.includes('建筑')) {
            char = '建';
            bgColor = '#fef9c3'; 
            textColor = '#854d0e';
          } else if (m.includes('市政')) {
            char = '市';
            bgColor = '#ffedd5'; 
            textColor = '#c2410c';
          } else if (m.includes('机电')) {
            char = '机';
            bgColor = '#dbeafe'; 
            textColor = '#1e40af';
          } else if (m.includes('公路')) {
            char = '公';
            bgColor = '#d1fae5'; 
            textColor = '#065f46';
          } else if (m.includes('水利')) {
            char = '水';
            bgColor = '#e0f2fe'; 
            textColor = '#0369a1';
          }
          
          return (
            <span 
              key={idx} 
              className="badge d-inline-flex align-items-center justify-content-center border"
              style={{ 
                backgroundColor: bgColor, 
                color: textColor, 
                borderColor: 'rgba(0,0,0,0.06)',
                fontSize: '0.75rem',
                padding: '0.15rem 0.3rem',
                minWidth: '20px',
                height: '20px',
                fontWeight: 'bold'
              }}
              title={m}
            >
              {char}
            </span>
          );
        })}
      </div>
    );
  };

  // ==========================================
  // 提取数字工具函数 (用于前端规模过滤)
  // ==========================================
  const parseNum = (str: string): number => {
    if (!str) return 0;
    const match = str.match(/[\d\.]+/);
    return match ? parseFloat(match[0]) : 0;
  };

  const checkProjectCompletedYear = (durationStr: string, limitYears: number): boolean => {
    if (!durationStr) return false;
    const years = durationStr.match(/\b(20\d{2})\b/g);
    if (years && years.length > 0) {
      const lastYear = parseInt(years[years.length - 1]);
      const currentYear = new Date().getFullYear();
      return currentYear - lastYear <= limitYears;
    }
    return false;
  };

  // ==========================================
  // 前端过滤计算 (项目经理视图)
  // ==========================================
  const filteredManagers = managers.filter((mgr) => {
    if (mgrSearch && !mgr.name.includes(mgrSearch) && !mgr.memo.includes(mgrSearch)) {
      return false;
    }
    if (mgrStatus !== 'all' && mgr.status !== mgrStatus) {
      return false;
    }
    if (mgrCertMajor && !mgr.cert_major.includes(mgrCertMajor)) {
      return false;
    }
    if (mgrSafety !== 'all' && mgr.safety_cert !== mgrSafety) {
      return false;
    }

    const myProjects = projects.filter((p) => p.manager_name === mgr.name);

    if (mgrMinAmount !== 'all') {
      const limit = parseFloat(mgrMinAmount);
      const hasLargeProject = myProjects.some((p) => parseNum(p.amount) >= limit);
      if (!hasLargeProject) return false;
    }

    if (mgrMinArea !== 'all') {
      const limit = parseFloat(mgrMinArea);
      const hasLargeArea = myProjects.some((p) => parseNum(p.area) >= limit);
      if (!hasLargeArea) return false;
    }

    if (mgrCompletedIn !== 'all') {
      const limitYears = parseInt(mgrCompletedIn);
      const hasRecentProject = myProjects.some((p) =>
        checkProjectCompletedYear(p.duration, limitYears)
      );
      if (!hasRecentProject) return false;
    }

    return true;
  });

  // ==========================================
  // 前端过滤计算 (项目视图)
  // ==========================================
  const filteredProjects = projects.filter((proj) => {
    if (
      projSearch &&
      !proj.project_name.includes(projSearch) &&
      !proj.manager_name.includes(projSearch)
    ) {
      return false;
    }
    if (projRole !== 'all' && proj.role !== projRole) {
      return false;
    }
    if (projRecord !== 'all' && !proj.record_status.includes(projRecord)) {
      return false;
    }
    if (projMgrStatus !== 'all' && proj.manager_status !== projMgrStatus) {
      return false;
    }
    if (projMinAmount !== 'all') {
      const limit = parseFloat(projMinAmount);
      if (parseNum(proj.amount) < limit) return false;
    }
    if (projMinArea !== 'all') {
      const limit = parseFloat(projMinArea);
      if (parseNum(proj.area) < limit) return false;
    }
    if (projTimeStatus !== 'all') {
      const isOngoing = proj.duration.includes('在建') || proj.duration.includes('至今');
      if (projTimeStatus === '在建' && !isOngoing) return false;
      if (projTimeStatus === '已竣工' && isOngoing) return false;
    }

    return true;
  });

  // ==========================================
  // 如果未登录，渲染全屏登录界面
  // ==========================================
  if (!token) {
    return (
      <div className="d-flex align-items-center justify-content-center bg-dark" style={{ minHeight: '100vh', background: 'radial-gradient(circle, #1e3a8a 0%, #0f172a 100%)' }}>
        <div className="card border-0 shadow-lg p-4 text-white" style={{ maxWidth: '400px', width: '100%', backgroundColor: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(10px)', borderRadius: '1.2rem' }}>
          <div className="text-center mb-4">
            <div className="fs-1 text-info mb-2"><i className="bi bi-shield-lock-fill"></i></div>
            <h3 className="font-weight-bold">台账系统登录</h3>
            <p className="text-info small">请提供管理员凭据访问一建业绩大屏</p>
          </div>
          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="form-label small text-white-50">用户名</label>
              <div className="input-group">
                <span className="input-group-text bg-secondary border-0 text-white"><i className="bi bi-person"></i></span>
                <input
                  type="text"
                  className="form-control bg-dark border-0 text-white"
                  placeholder="请输入用户名"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="form-label small text-white-50">密码</label>
              <div className="input-group">
                <span className="input-group-text bg-secondary border-0 text-white"><i className="bi bi-key"></i></span>
                <input
                  type="password"
                  className="form-control bg-dark border-0 text-white"
                  placeholder="请输入密码"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  required
                />
              </div>
            </div>
            {loginError && (
              <div className="alert alert-danger p-2 fs-7 mb-3 border-0 bg-danger bg-opacity-20 text-danger">
                <i className="bi bi-exclamation-circle-fill me-1"></i> {loginError}
              </div>
            )}
            <button type="submit" className="btn btn-info w-100 py-2.5 font-weight-bold text-white shadow" disabled={loggingIn}>
              {loggingIn ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  正在验证授权...
                </>
              ) : (
                '立即授权登录'
              )}
            </button>
          </form>
          <div className="text-center mt-4 text-white-50 small" style={{ fontSize: '0.7rem' }}>
            默认管理员账号：admin | 密码：admin123
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 已登录状态，渲染系统主界面
  // ==========================================
  return (
    <div className="container py-4">
      {/* 头部标题与用户信息 */}
      <header className="d-flex flex-wrap align-items-center justify-content-between pb-3 mb-4 border-bottom gap-3">
        <div>
          <h1 className="h2 text-dark font-weight-bold">
            <i className="bi bi-buildings-fill text-primary me-2"></i>
            一建注册项目经理业绩台账管理系统
          </h1>
          <p className="text-muted mb-0 small">
            基于 Cloudflare D1 + Bootstrap 5 实现的投标与备案状态多维分析看板
          </p>
        </div>
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <span className="text-secondary small bg-body-tertiary p-2 px-3 rounded shadow-2xs border">
            <i className="bi bi-person-circle text-primary me-1.5"></i>
            当前用户: <strong>{username}</strong>
          </span>
          <button className="btn btn-primary d-flex align-items-center" onClick={openAddManager}>
            <i className="bi bi-person-plus-fill me-1"></i> 新增项目经理
          </button>
          <button className="btn btn-outline-danger d-flex align-items-center" onClick={handleLogout}>
            <i className="bi bi-box-arrow-right me-1"></i> 退出登录
          </button>
        </div>
      </header>

      {/* 顶部统计卡片指标 */}
      {loading ? (
        <div className="text-center my-4 py-3">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="mt-2 text-muted">正在加载统计看板...</p>
        </div>
      ) : (
        <section className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <div className="card h-100 border-0 shadow-sm bg-body-tertiary">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <h6 className="card-subtitle text-muted mb-1 text-uppercase small">经理总人数</h6>
                  <h2 className="card-title mb-0 font-weight-bold">{stats.total_managers}</h2>
                </div>
                <div className="fs-1 text-primary"><i className="bi bi-people-fill"></i></div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card h-100 border-0 shadow-sm bg-success bg-opacity-10">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <h6 className="card-subtitle text-success mb-1 text-uppercase small">可投标（空闲）</h6>
                  <h2 className="card-title mb-0 text-success font-weight-bold">{stats.idle_managers}</h2>
                </div>
                <div className="fs-1 text-success"><i className="bi bi-check-circle-fill"></i></div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card h-100 border-0 shadow-sm bg-danger bg-opacity-10">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <h6 className="card-subtitle text-danger mb-1 text-uppercase small">在建锁定</h6>
                  <h2 className="card-title mb-0 text-danger font-weight-bold">{stats.locked_managers}</h2>
                </div>
                <div className="fs-1 text-danger"><i className="bi bi-lock-fill"></i></div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card h-100 border-0 shadow-sm bg-warning bg-opacity-10 border-start border-warning border-4">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <h6 className="card-subtitle text-warning mb-1 text-uppercase small">累计业绩金额</h6>
                  <h2 className="card-title mb-0 text-warning-emphasis font-weight-bold">
                    {(stats.total_amount_万元 / 10000).toFixed(1)} <span className="fs-6">亿元</span>
                  </h2>
                </div>
                <div className="fs-1 text-warning"><i className="bi bi-currency-yen"></i></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 视图切换 TAB */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link fs-5 py-2 px-4 ${activeTab === 'manager' ? 'active font-weight-bold' : ''}`}
            onClick={() => setActiveTab('manager')}
          >
            <i className="bi bi-person-badge-fill me-2"></i>项目经理视图 (以人为本)
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link fs-5 py-2 px-4 ${activeTab === 'project' ? 'active font-weight-bold' : ''}`}
            onClick={() => setActiveTab('project')}
          >
            <i className="bi bi-journal-album me-2"></i>工程业绩视图 (以项目为本)
          </button>
        </li>
      </ul>

      {/* 主体展示区 */}
      {error && <div className="alert alert-danger shadow-sm"><i className="bi bi-exclamation-triangle-fill me-2"></i>{error}</div>}

      {activeTab === 'manager' ? (
        // ==========================================
        // 视图一：项目经理视图
        // ==========================================
        <div>
          {/* 筛选面板 */}
          <div className="card border-0 shadow-sm p-4 mb-4 bg-body-tertiary">
            <h5 className="mb-3 text-secondary font-weight-bold small text-uppercase">
              <i className="bi bi-funnel-fill me-1"></i> 多维度组合筛选器 (项目经理)
            </h5>
            <div className="row g-3">
              <div className="col-12 col-md-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="搜索经理姓名或备注..."
                  value={mgrSearch}
                  onChange={(e) => setMgrSearch(e.target.value)}
                />
              </div>
              <div className="col-6 col-md-2">
                <select
                  className="form-select"
                  value={mgrStatus}
                  onChange={(e) => setMgrStatus(e.target.value)}
                >
                  <option value="all">人员状态 (全部)</option>
                  <option value="idle">🟢 空闲 (可投标)</option>
                  <option value="locked">🔴 锁定 (不可投标)</option>
                </select>
              </div>
              <div className="col-6 col-md-2">
                <select
                  className="form-select"
                  value={mgrSafety}
                  onChange={(e) => setMgrSafety(e.target.value)}
                >
                  <option value="all">安考证 (全部)</option>
                  <option value="A">A 证</option>
                  <option value="B">B 证</option>
                  <option value="C">C 证</option>
                  <option value="无">无安考证</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="筛选证书专业 (如: 建筑/市政)..."
                  value={mgrCertMajor}
                  onChange={(e) => setMgrCertMajor(e.target.value)}
                />
              </div>
              <div className="col-6 col-md-2">
                <button
                  className="btn btn-outline-secondary w-100"
                  onClick={() => {
                    setMgrSearch('');
                    setMgrStatus('all');
                    setMgrSafety('all');
                    setMgrCertMajor('');
                    setMgrMinAmount('all');
                    setMgrMinArea('all');
                    setMgrCompletedIn('all');
                  }}
                >
                  重置筛选
                </button>
              </div>
            </div>
            {/* 高级过滤条件 */}
            <div className="row g-3 mt-2 border-top pt-3">
              <div className="col-6 col-md-4">
                <div className="input-group">
                  <span className="input-group-text bg-transparent text-muted small">单笔业绩金额</span>
                  <select
                    className="form-select"
                    value={mgrMinAmount}
                    onChange={(e) => setMgrMinAmount(e.target.value)}
                  >
                    <option value="all">金额无限制</option>
                    <option value="3000">&gt;= 3000 万元</option>
                    <option value="5000">&gt;= 5000 万元</option>
                    <option value="10000">&gt;= 1 亿元</option>
                  </select>
                </div>
              </div>
              <div className="col-6 col-md-4">
                <div className="input-group">
                  <span className="input-group-text bg-transparent text-muted small">单笔项目面积</span>
                  <select
                    className="form-select"
                    value={mgrMinArea}
                    onChange={(e) => setMgrMinArea(e.target.value)}
                  >
                    <option value="all">面积无限制</option>
                    <option value="10000">&gt;= 1 万㎡</option>
                    <option value="30000">&gt;= 3 万㎡</option>
                    <option value="50000">&gt;= 5 万㎡</option>
                  </select>
                </div>
              </div>
              <div className="col-12 col-md-4">
                <div className="input-group">
                  <span className="input-group-text bg-transparent text-muted small">业绩竣工年份</span>
                  <select
                    className="form-select"
                    value={mgrCompletedIn}
                    onChange={(e) => setMgrCompletedIn(e.target.value)}
                  >
                    <option value="all">时间无限制</option>
                    <option value="3">名下近 3 年有竣工业绩</option>
                    <option value="5">名下近 5 年有竣工业绩</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 数据总列表 */}
          <div className="text-secondary mb-3 small d-flex align-items-center justify-content-between">
            <span>找到 {filteredManagers.length} 位符合筛选条件的项目经理</span>
            <button className="btn btn-sm btn-outline-primary" onClick={fetchAllData}>
              <i className="bi bi-arrow-clockwise"></i> 刷新数据
            </button>
          </div>

          {filteredManagers.length === 0 ? (
            <div className="card text-center p-5 border-0 bg-light shadow-sm">
              <p className="lead mb-0 text-muted">✍️ 暂无符合筛选条件的项目经理</p>
            </div>
          ) : (
            <div className="table-responsive border shadow-sm rounded bg-body">
              <table className="table table-striped table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th scope="col" className="py-2.5">姓名</th>
                    <th scope="col" className="py-2.5">人员类型</th>
                    <th scope="col" className="py-2.5">注册专业</th>
                    <th scope="col" className="py-2.5">职称专业</th>
                    <th scope="col" className="py-2.5">安考证书</th>
                    <th scope="col" className="py-2.5 text-center">名下业绩</th>
                    <th scope="col" className="py-2.5">备注说明</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredManagers.map((mgr) => {
                    const myProjects = projects.filter((p) => p.manager_name === mgr.name);
                    return (
                      <tr key={mgr.id}>
                        <td className="py-2 position-relative">
                          <span 
                            className="badge text-white px-2.5 py-1.5 fs-7.5 font-weight-bold" 
                            style={{ 
                              backgroundColor: mgr.status === 'idle' ? '#22c55e' : '#ef4444',
                              minWidth: '85px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              userSelect: 'none',
                              gap: '4px'
                            }}
                            onClick={(e) => {
                              e.stopPropagation(); // 阻止冒泡到 document 全局关闭事件
                              setActiveMenuManagerId(activeMenuManagerId === mgr.id ? null : mgr.id);
                            }}
                            title="点击展示操作菜单"
                          >
                            {mgr.name}
                            <i className="bi bi-caret-down-fill" style={{ fontSize: '0.65rem' }}></i>
                          </span>

                          {activeMenuManagerId === mgr.id && (
                            <div 
                              className="dropdown-menu show shadow-lg border position-absolute" 
                              style={{ 
                                zIndex: 1050, 
                                left: '12px', 
                                top: '38px', 
                                minWidth: '160px',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button 
                                type="button" 
                                className="dropdown-item py-2 d-flex align-items-center" 
                                onClick={() => {
                                  openAddProject(mgr.name);
                                  setActiveMenuManagerId(null);
                                }}
                              >
                                <i className="bi bi-plus-circle text-primary me-2"></i>
                                <span>增关联项目</span>
                              </button>
                              <button 
                                type="button" 
                                className="dropdown-item py-2 d-flex align-items-center" 
                                onClick={() => {
                                  openEditManager(mgr);
                                  setActiveMenuManagerId(null);
                                }}
                              >
                                <i className="bi bi-pencil-square text-secondary me-2"></i>
                                <span>修改基本信息</span>
                              </button>
                              <div className="dropdown-divider my-1"></div>
                              <button 
                                type="button" 
                                className="dropdown-item py-2 d-flex align-items-center text-danger" 
                                onClick={() => {
                                  handleDeleteManager(mgr.id, mgr.name);
                                  setActiveMenuManagerId(null);
                                }}
                              >
                                <i className="bi bi-trash3-fill me-2"></i>
                                <span>删除人员</span>
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-2">
                          <span 
                            className="badge rounded-circle d-inline-flex align-items-center justify-content-center text-white" 
                            style={{ 
                              width: '24px', 
                              height: '24px', 
                              backgroundColor: projects.filter((p) => p.manager_name === mgr.name).some((p) => p.role === '技术负责人')
                                ? '#0ea5e9'
                                : '#a855f7',
                              fontWeight: 'bold',
                              fontSize: '0.8rem'
                            }}
                            title={projects.filter((p) => p.manager_name === mgr.name).some((p) => p.role === '技术负责人')
                              ? '技术负责人'
                              : '项目经理'}
                          >
                            {projects.filter((p) => p.manager_name === mgr.name).some((p) => p.role === '技术负责人')
                              ? '技'
                              : '项'}
                          </span>
                        </td>
                        <td className="py-2">{renderCertMajorBadges(mgr.cert_major)}</td>
                        <td className="py-2 small text-secondary">{mgr.title ? `${mgr.title_major || '未填'} (${mgr.title})` : '—'}</td>
                        <td className="py-2">
                          {(() => {
                            const certLetter = mgr.safety_cert ? mgr.safety_cert.replace('证', '').trim().toUpperCase() : '';
                            if (certLetter === 'A' || certLetter === 'B' || certLetter === 'C') {
                              return (
                                <span 
                                  className="badge rounded-circle d-inline-flex align-items-center justify-content-center border" 
                                  style={{ 
                                    width: '22px', 
                                    height: '22px', 
                                    backgroundColor: certLetter === 'A' 
                                      ? '#fee2e2' // A证 - 淡红
                                      : certLetter === 'B'
                                      ? '#dbeafe' // B证 - 淡蓝
                                      : '#fef3c7', // C证 - 淡黄
                                    color: certLetter === 'A' 
                                      ? '#991b1b' 
                                      : certLetter === 'B'
                                      ? '#1e40af' 
                                      : '#78350f',
                                    borderColor: certLetter === 'A' 
                                      ? 'rgba(153, 27, 27, 0.2)' 
                                      : certLetter === 'B'
                                      ? 'rgba(30, 64, 175, 0.2)' 
                                      : 'rgba(120, 53, 15, 0.2)',
                                    fontWeight: 'bold',
                                    fontSize: '0.8rem'
                                  }}
                                  title={`安全生产考核合格 ${certLetter} 证`}
                                >
                                  {certLetter}
                                </span>
                              );
                            }
                            return <span className="text-muted">—</span>;
                          })()}
                        </td>
                        <td className="py-2 text-center">
                          <span className="badge bg-light text-dark border fs-8">
                            {myProjects.length} 项
                          </span>
                        </td>
                        <td className="py-2 small text-muted text-truncate" style={{ maxWidth: '250px' }} title={mgr.memo}>
                          {mgr.memo || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        // ==========================================
        // 视图二：工程业绩视图
        // ==========================================
        <div>
          {/* 筛选面板 */}
          <div className="card border-0 shadow-sm p-4 mb-4 bg-body-tertiary">
            <h5 className="mb-3 text-secondary font-weight-bold small text-uppercase">
              <i className="bi bi-funnel-fill me-1"></i> 多维度组合筛选器 (工程业绩)
            </h5>
            <div className="row g-3">
              <div className="col-12 col-md-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="搜索项目名称或经理姓名..."
                  value={projSearch}
                  onChange={(e) => setProjSearch(e.target.value)}
                />
              </div>
              <div className="col-6 col-md-2">
                <select
                  className="form-select"
                  value={projRole}
                  onChange={(e) => setProjRole(e.target.value)}
                >
                  <option value="all">担任职位 (全部)</option>
                  <option value="项目经理">项目经理</option>
                  <option value="技术负责人">技术负责人</option>
                </select>
              </div>
              <div className="col-6 col-md-2">
                <select
                  className="form-select"
                  value={projRecord}
                  onChange={(e) => setProjRecord(e.target.value)}
                >
                  <option value="all">四库平台 (全部)</option>
                  <option value="已备案">已备案</option>
                  <option value="无">未备案</option>
                </select>
              </div>
              <div className="col-6 col-md-3">
                <select
                  className="form-select"
                  value={projMgrStatus}
                  onChange={(e) => setProjMgrStatus(e.target.value)}
                >
                  <option value="all">对应负责人状态 (全部)</option>
                  <option value="idle">🟢 负责人当前空闲 (该业绩可用)</option>
                  <option value="locked">🔴 负责人已被锁在别处 (该业绩不可用)</option>
                </select>
              </div>
              <div className="col-6 col-md-2">
                <button
                  className="btn btn-outline-secondary w-100"
                  onClick={() => {
                    setProjSearch('');
                    setProjRole('all');
                    setProjRecord('all');
                    setProjMgrStatus('all');
                    setProjMinAmount('all');
                    setProjMinArea('all');
                    setProjTimeStatus('all');
                  }}
                >
                  重置筛选
                </button>
              </div>
            </div>
            {/* 项目规模/时间过滤条件 */}
            <div className="row g-3 mt-2 border-top pt-3">
              <div className="col-6 col-md-4">
                <div className="input-group">
                  <span className="input-group-text bg-transparent text-muted small">单笔项目金额</span>
                  <select
                    className="form-select"
                    value={projMinAmount}
                    onChange={(e) => setProjMinAmount(e.target.value)}
                  >
                    <option value="all">全部金额</option>
                    <option value="3000">&gt;= 3000 万元</option>
                    <option value="5000">&gt;= 5000 万元</option>
                    <option value="10000">&gt;= 1 亿元</option>
                  </select>
                </div>
              </div>
              <div className="col-6 col-md-4">
                <div className="input-group">
                  <span className="input-group-text bg-transparent text-muted small">单笔项目面积</span>
                  <select
                    className="form-select"
                    value={projMinArea}
                    onChange={(e) => setProjMinArea(e.target.value)}
                  >
                    <option value="all">全部面积</option>
                    <option value="10000">&gt;= 1 万㎡</option>
                    <option value="30000">&gt;= 3 万㎡</option>
                    <option value="50000">&gt;= 5 万㎡</option>
                  </select>
                </div>
              </div>
              <div className="col-12 col-md-4">
                <div className="input-group">
                  <span className="input-group-text bg-transparent text-muted small">项目时间状态</span>
                  <select
                    className="form-select"
                    value={projTimeStatus}
                    onChange={(e) => setProjTimeStatus(e.target.value)}
                  >
                    <option value="all">全部状态</option>
                    <option value="在建">在建中 / 至今</option>
                    <option value="已竣工">已竣工项目</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 项目展示列表 */}
          {(() => {
            const groupedMap: { [key: string]: {
              project_name: string;
              amount: string;
              area: string;
              duration: string;
              record_status: string;
              filing_status: string;
              filing_end: string;
              staffs: {
                id: number;
                manager_name: string;
                role: string;
                manager_status: 'idle' | 'locked';
                raw_project: Project;
              }[];
            }} = {};

            filteredProjects.forEach((p) => {
              if (!groupedMap[p.project_name]) {
                groupedMap[p.project_name] = {
                  project_name: p.project_name,
                  amount: p.amount,
                  area: p.area,
                  duration: p.duration,
                  record_status: p.record_status,
                  filing_status: p.filing_status,
                  filing_end: p.filing_end,
                  staffs: [],
                };
              }
              groupedMap[p.project_name].staffs.push({
                id: p.id,
                manager_name: p.manager_name,
                role: p.role,
                manager_status: p.manager_status,
                raw_project: p,
              });
            });

            const groupedList = Object.values(groupedMap);

            return (
              <>
                <div className="text-secondary mb-3 small d-flex align-items-center justify-content-between">
                  <span>找到 {groupedList.length} 个合并工程项目 (共包含 {filteredProjects.length} 条岗位记录)</span>
                  <button className="btn btn-sm btn-outline-primary" onClick={fetchAllData}>
                    <i className="bi bi-arrow-clockwise"></i> 刷新数据
                  </button>
                </div>

                {groupedList.length === 0 ? (
                  <div className="card text-center p-5 border-0 bg-light shadow-sm">
                    <p className="lead mb-0 text-muted">🏗️ 暂无符合筛选条件的工程项目</p>
                  </div>
                ) : (
                  <div className="row g-3">
                    {groupedList.map((gp, idx) => (
                      <div key={idx} className="col-12 mb-3">
                        {/* 深蓝色大容器底色 */}
                        <div className="rounded p-3 shadow-sm text-white" style={{ backgroundColor: '#1e4663' }}>
                          <div className="row g-3 align-items-center">
                            {/* 左侧属性方块区域 (占用 6 个栅格) */}
                            <div className="col-12 col-lg-6">
                              <div className="d-flex flex-wrap gap-2">
                                {/* 项目名称瓷贴 (粉紫) */}
                                <div className="rounded p-2 px-3 d-flex flex-column justify-content-center shadow-2xs" 
                                     style={{ backgroundColor: '#f5d0fe', color: '#701a75', minWidth: '160px', minHeight: '80px', maxWidth: '300px' }}>
                                  <span className="fs-6 font-weight-bold text-truncate-2" title={gp.project_name}>
                                    {gp.project_name}
                                  </span>
                                  <span className="fs-8 opacity-75">工程项目</span>
                                </div>

                                {/* 金额瓷贴 (粉红) */}
                                <div className="rounded p-2 px-3 text-center d-flex flex-column justify-content-center align-items-center shadow-2xs"
                                     style={{ backgroundColor: '#fce7f3', color: '#831843', minWidth: '90px', minHeight: '80px' }}>
                                  <span className="fs-6 font-weight-bold text-truncate w-100">{gp.amount || '—'}</span>
                                  <span className="fs-8 opacity-75">合同金额</span>
                                </div>

                                {/* 面积瓷贴 (粉红) */}
                                <div className="rounded p-2 px-3 text-center d-flex flex-column justify-content-center align-items-center shadow-2xs"
                                     style={{ backgroundColor: '#fce7f3', color: '#831843', minWidth: '90px', minHeight: '80px' }}>
                                  <span className="fs-6 font-weight-bold text-truncate w-100">{gp.area || '—'}</span>
                                  <span className="fs-8 opacity-75">建筑面积</span>
                                </div>

                                {/* 四库备案瓷贴 */}
                                <div className="rounded p-2 px-3 text-center d-flex flex-column justify-content-center align-items-center shadow-2xs"
                                     style={{ backgroundColor: '#e0f2fe', color: '#0369a1', minWidth: '80px', minHeight: '80px' }}>
                                  <span className="fs-7 font-weight-bold text-truncate w-100">{gp.record_status || '无'}</span>
                                  <span className="fs-8 opacity-75">四库平台</span>
                                </div>

                                {/* 备案状态瓷贴 */}
                                {gp.filing_status && (
                                  <div className="rounded p-2 px-3 text-center d-flex flex-column justify-content-center align-items-center shadow-2xs"
                                       style={gp.filing_status === '备案中' 
                                         ? { backgroundColor: '#fee2e2', color: '#991b1b', minWidth: '90px', minHeight: '80px' } 
                                         : { backgroundColor: '#d1fae5', color: '#065f46', minWidth: '90px', minHeight: '80px' }}>
                                    <span className="fs-7 font-weight-bold">{gp.filing_status}</span>
                                    <span className="fs-8 opacity-75">云端备案</span>
                                  </div>
                                )}
                              </div>

                              {/* 工期基本信息 */}
                              <div className="mt-3 pt-2 border-top border-white border-opacity-10 text-white-50 small">
                                <i className="bi bi-calendar3 me-1"></i> <strong>开竣工时间/工期:</strong> {gp.duration || '—'}
                              </div>
                            </div>

                            {/* 右侧参建人员明细条区域 (占用 6 个栅格) */}
                            <div className="col-12 col-lg-6 border-start border-white border-opacity-10 ps-lg-4">
                              <div className="d-flex justify-content-between align-items-center mb-2.5">
                                <h6 className="mb-0 font-weight-bold text-white-50">
                                  <i className="bi bi-people-fill me-1"></i> 本项目参建人员 ({gp.staffs.length})
                                </h6>
                              </div>

                              <div className="table-responsive" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                <table className="table table-sm table-borderless align-middle mb-0 text-white small" style={{ fontSize: '0.8rem' }}>
                                  <thead>
                                    <tr className="border-bottom border-white border-opacity-10 text-white-50 fs-8">
                                      <th className="py-1">名字</th>
                                      <th className="py-1 text-center">职责</th>
                                      <th className="py-1 text-center">证书</th>
                                      <th className="py-1 text-end">操作</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {gp.staffs.map((staff) => {
                                      const isLocked = staff.manager_status === 'locked';
                                      const roleAbbr = getRoleAbbr(staff.role);
                                      const certAbbr = getCertMajorAbbr(staff.manager_name);
                                      return (
                                        <tr key={staff.id} className="border-bottom border-white border-opacity-5">
                                          {/* 名字：锁定红色，未锁定绿色 */}
                                          <td className="py-1.5 font-weight-bold text-truncate" style={{ maxWidth: '95px' }}>
                                            <span 
                                              className="badge px-2 py-1 rounded text-white" 
                                              style={{ 
                                                backgroundColor: isLocked ? '#ef4444' : '#22c55e', 
                                                display: 'inline-block',
                                                minWidth: '65px',
                                                textAlign: 'center'
                                              }}
                                            >
                                              {staff.manager_name}
                                            </span>
                                          </td>
                                          {/* 职责：“项”或“技” */}
                                          <td className="py-1.5 text-center">
                                            <span 
                                              className="badge rounded-circle d-inline-flex align-items-center justify-content-center" 
                                              style={{ 
                                                width: '22px', 
                                                height: '22px', 
                                                backgroundColor: staff.role === '项目经理' ? '#a855f7' : '#0ea5e9',
                                                color: '#fff',
                                                fontWeight: 'bold',
                                                fontSize: '0.75rem'
                                              }}
                                              title={staff.role}
                                            >
                                              {roleAbbr}
                                            </span>
                                          </td>
                                          {/* 证书专业：建/市 */}
                                          <td className="py-1.5 text-center font-weight-bold">
                                            {certAbbr !== '—' ? (
                                              certAbbr.split('/').map((c, i) => (
                                                <span 
                                                  key={i} 
                                                  className="badge mx-0.5 px-1.5 py-0.5 rounded text-dark" 
                                                  style={{ 
                                                    backgroundColor: c === '建' ? '#fde047' : '#fdba74', 
                                                    fontSize: '0.7rem' 
                                                  }}
                                                >
                                                  {c}
                                                </span>
                                              ))
                                            ) : (
                                              <span className="text-white-50">—</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 text-end">
                                            <div className="btn-group btn-group-xs">
                                              <button
                                                type="button"
                                                className="btn btn-outline-light border-0 py-0 px-1.5 fs-8 opacity-75 hover-opacity-100"
                                                onClick={() => openEditProject(staff.raw_project)}
                                              >
                                                改
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-outline-danger border-0 py-0 px-1.5 fs-8 opacity-75 hover-opacity-100"
                                                onClick={() => handleDeleteProject(staff.id)}
                                              >
                                                删
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* 底部系统操作审计日志按钮 */}
      <footer className="text-center text-muted small py-4 border-top mt-5 d-flex flex-column align-items-center justify-content-center gap-2">
        <button className="btn btn-sm btn-outline-secondary d-flex align-items-center" onClick={openLogsModal}>
          <i className="bi bi-shield-shaded me-1.5 text-info"></i>
          查看系统安全操作审计日志 (最近50条修改)
        </button>
        <p className="mb-0 mt-2">一建注册业绩大屏 &copy; 2026 Antigravity Pair Programming Project</p>
        <p className="mb-0 text-muted opacity-50" style={{ fontSize: '0.7rem' }}>
          Security Mode: JWT Authentication | API Target: {API_BASE}
        </p>
      </footer>

      {/* ==========================================
          MODAL 0: 查看审计日志
          ========================================== */}
      {showLogsModal && (
        <div className="modal show d-block bg-dark bg-opacity-50" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header bg-dark text-white">
                <h5 className="modal-title font-weight-bold">
                  <i className="bi bi-shield-lock-fill text-info me-2"></i>
                  系统数据变更与安全审计日志
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowLogsModal(false)}></button>
              </div>
              <div className="modal-body p-0">
                {loadingLogs ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-info" role="status"></div>
                    <p className="mt-2 text-muted">正在载入云端 D1 审计流水...</p>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <p className="mb-0">🛡️ 暂无任何人员或项目数据变更记录</p>
                  </div>
                ) : (
                  <div className="table-responsive" style={{ maxHeight: '400px' }}>
                    <table className="table table-hover table-striped mb-0 align-middle small">
                      <thead className="table-dark">
                        <tr>
                          <th>操作时间</th>
                          <th>操作账户</th>
                          <th>审计事件</th>
                          <th>具体细节描述</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="text-muted text-nowrap">{log.created_at}</td>
                            <td>
                              <span className="badge bg-secondary">{log.user_name}</span>
                            </td>
                            <td>
                              <span className={`badge ${
                                log.action.startsWith('ADD') ? 'bg-success' :
                                log.action.startsWith('EDIT') ? 'bg-warning text-dark' :
                                log.action.startsWith('DELETE') ? 'bg-danger' : 'bg-info'
                              }`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="font-weight-bold text-dark">{log.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer bg-light">
                <button type="button" className="btn btn-secondary" onClick={() => setShowLogsModal(false)}>关闭日志</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 1: 新增/修改项目经理
          ========================================== */}
      {showMgrModal && (
        <div className="modal show d-block bg-dark bg-opacity-50" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title font-weight-bold">
                  {editingManager ? '修改项目经理信息' : '添加新的项目经理'}
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowMgrModal(false)}></button>
              </div>
              <form onSubmit={handleSaveManager}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label font-weight-bold">姓名 <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={mgrForm.name}
                      onChange={(e) => setMgrForm({ ...mgrForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="row mb-3">
                    <div className="col-6">
                      <label className="form-label">职称</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="如: 高级工程师"
                        value={mgrForm.title}
                        onChange={(e) => setMgrForm({ ...mgrForm, title: e.target.value })}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label">职称专业</label>
                      <input
                        type="text"
                        className="form-control"
                        value={mgrForm.title_major}
                        onChange={(e) => setMgrForm({ ...mgrForm, title_major: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="row mb-3">
                    <div className="col-6">
                      <label className="form-label">注册证书名</label>
                      <input
                        type="text"
                        className="form-control"
                        value={mgrForm.cert_name}
                        onChange={(e) => setMgrForm({ ...mgrForm, cert_name: e.target.value })}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label">安全生产考核证</label>
                      <select
                        className="form-select"
                        value={mgrForm.safety_cert}
                        onChange={(e) => setMgrForm({ ...mgrForm, safety_cert: e.target.value })}
                      >
                        <option value="无">无安全考核证</option>
                        <option value="A">A 证 (企业负责人)</option>
                        <option value="B">B 证 (项目经理)</option>
                        <option value="C">C 证 (专职安全员)</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">证书注册专业</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="多专业请直接拼接，如: 建筑工程市政公用工程"
                      value={mgrForm.cert_major}
                      onChange={(e) => setMgrForm({ ...mgrForm, cert_major: e.target.value })}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">备注说明</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={mgrForm.memo}
                      onChange={(e) => setMgrForm({ ...mgrForm, memo: e.target.value })}
                    ></textarea>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowMgrModal(false)}>取消</button>
                  <button type="submit" className="btn btn-primary">保存数据</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 2: 新增/修改工程业绩
          ========================================== */}
      {showProjModal && (
        <div className="modal show d-block bg-dark bg-opacity-50" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title font-weight-bold">
                  {editingProject ? `修改工程业绩信息` : `为 "${targetManagerName}" 添加业绩项目`}
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowProjModal(false)}></button>
              </div>
              <form onSubmit={handleSaveProject}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label font-weight-bold">项目名称 <span className="text-danger">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={projForm.project_name}
                      onChange={(e) => setProjForm({ ...projForm, project_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="row mb-3">
                    <div className="col-4">
                      <label className="form-label">担任职务</label>
                      <select
                        className="form-select"
                        value={projForm.role}
                        onChange={(e) => setProjForm({ ...projForm, role: e.target.value })}
                      >
                        <option value="项目经理">项目经理</option>
                        <option value="技术负责人">技术负责人</option>
                        <option value="其他">其他人员</option>
                      </select>
                    </div>
                    <div className="col-4">
                      <label className="form-label">合同金额</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="如: 10936万元"
                        value={projForm.amount}
                        onChange={(e) => setProjForm({ ...projForm, amount: e.target.value })}
                      />
                    </div>
                    <div className="col-4">
                      <label className="form-label">建筑面积</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="如: 24000平方米"
                        value={projForm.area}
                        onChange={(e) => setProjForm({ ...projForm, area: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="row mb-3">
                    <div className="col-6">
                      <label className="form-label">开竣工时间</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="如: 2020.11.25—2022.11.10 或 在建"
                        value={projForm.duration}
                        onChange={(e) => setProjForm({ ...projForm, duration: e.target.value })}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label">四库平台备案情况</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="如: 已备案 或 无"
                        value={projForm.record_status}
                        onChange={(e) => setProjForm({ ...projForm, record_status: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="row mb-3 border-top pt-3">
                    <div className="col-12 mb-2 font-weight-bold text-secondary fs-7">
                      <i className="bi bi-globe me-1"></i> 云端备案监控状态 (云端判断锁证的关键)
                    </div>
                    <div className="col-6">
                      <label className="form-label">云端备案状态</label>
                      <select
                        className="form-select"
                        value={projForm.filing_status}
                        onChange={(e) => setProjForm({ ...projForm, filing_status: e.target.value })}
                      >
                        <option value="">无备案（解锁）</option>
                        <option value="备案中">备案中 (锁证 🔴)</option>
                        <option value="已备案">已备案 (若竣工且结束，则不锁定)</option>
                      </select>
                    </div>
                    <div className="col-6">
                      <label className="form-label">备案岗位</label>
                      <input
                        type="text"
                        className="form-control"
                        value={projForm.filing_post}
                        onChange={(e) => setProjForm({ ...projForm, filing_post: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="row mb-3">
                    <div className="col-6">
                      <label className="form-label">备案起始时间</label>
                      <input
                        type="date"
                        className="form-control"
                        value={projForm.filing_start}
                        onChange={(e) => setProjForm({ ...projForm, filing_start: e.target.value })}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label">备案预计结束时间</label>
                      <input
                        type="date"
                        className="form-control"
                        value={projForm.filing_end}
                        onChange={(e) => setProjForm({ ...projForm, filing_end: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowProjModal(false)}>取消</button>
                  <button type="submit" className="btn btn-primary">保存业绩</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
