import { useState, useEffect, Fragment } from 'react';
import './App.css';

interface Manager {
  name: string;
  title: string;
  title_major: string;
  title_date?: string | null;
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
  start_date: string | null;
  end_date: string | null;
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

interface DictionaryItem {
  id: number;
  type: string;
  value: string;
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

  // 视图切换: 'manager' (项目经理视图) | 'project' (project 视图) | 'dict' (参数配置视图)
  const [activeTab, setActiveTab] = useState<'manager' | 'project' | 'dict'>('manager');
  const [activeMenuManagerName, setActiveMenuManagerName] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedManagerIds, setExpandedManagerIds] = useState<string[]>([]);
  const [expandedProjectNames, setExpandedProjectNames] = useState<string[]>([]);

  // 数据列表状态
  const [managers, setManagers] = useState<Manager[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dictionaries, setDictionaries] = useState<DictionaryItem[]>([]);
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
  const [editingManagerName, setEditingManagerName] = useState<string | null>(null); // 保存修改前的原始姓名
  const [mgrForm, setMgrForm] = useState({
    name: '',
    title: '',
    title_major: '',
    title_date: '',
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
    start_date: '',
    end_date: '',
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

      // 4. 获取字典选项数据
      const dictRes = await fetchWithAuth(`${API_BASE}/api/dictionaries`);
      if (dictRes.ok) setDictionaries(await dictRes.json());

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
    const handleCloseMenu = () => setActiveMenuManagerName(null);
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
        ? `${API_BASE}/api/managers/${editingManagerName}`
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

  const handleDeleteManager = async (name: string) => {
    if (!confirm(`确定要删除项目经理 "${name}" 吗？此操作将同步级联删除他名下的所有项目业绩与专业！`)) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/managers/${name}`, { method: 'DELETE' });
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

  const toggleExpandProject = (projName: string) => {
    setExpandedProjectNames((prev) =>
      prev.includes(projName) ? prev.filter((p) => p !== projName) : [...prev, projName]
    );
  };

  const toggleExpandManager = (name: string) => {
    setExpandedManagerIds((prev) =>
      prev.includes(name) ? prev.filter((mName) => mName !== name) : [...prev, name]
    );
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
  // 数据字典维护处理
  // ==========================================
  const handleSaveDictionary = async (type: string, value: string, editId: number | null) => {
    if (!value.trim()) return;
    try {
      const isEdit = editId !== null;
      const url = isEdit
        ? `${API_BASE}/api/dictionaries/${editId}`
        : `${API_BASE}/api/dictionaries`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { value } : { type, value }),
      });

      if (!res.ok) throw new Error('保存字典项失败');
      await fetchAllData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteDictionary = async (id: number) => {
    if (!confirm('确定要删除此项参数吗？')) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/dictionaries/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除字典项失败');
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
    setEditingManagerName(null);
    setMgrForm({
      name: '',
      title: '',
      title_major: '',
      title_date: '',
      cert_name: '一级建造师',
      cert_major: '',
      safety_cert: '无',
      memo: '',
    });
    setShowMgrModal(true);
  };

  const openEditManager = (mgr: Manager) => {
    setEditingManager(mgr);
    setEditingManagerName(mgr.name);
    setMgrForm({
      name: mgr.name,
      title: mgr.title,
      title_major: mgr.title_major,
      title_date: mgr.title_date || '',
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
      start_date: '',
      end_date: '',
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
      start_date: proj.start_date || '',
      end_date: proj.end_date || '',
      record_status: proj.record_status,
      filing_status: proj.filing_status,
      filing_post: proj.filing_post,
      filing_start: proj.filing_start || '',
      filing_end: proj.filing_end || '',
    });
    setShowProjModal(true);
  };

  // 格式化金额或面积：自动清除“万元”、“平方米”后缀，提取数字并保留两位小数
  const formatAmountOrArea = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '—';
    const str = String(val).trim();
    if (!str || str === '/' || str === '—' || str === '无') return '—';
    
    const match = str.match(/-?\d+(\.\d+)?/);
    if (match) {
      const num = parseFloat(match[0]);
      if (!isNaN(num)) {
        return num.toFixed(2);
      }
    }
    // 若匹配不到有效数字（如“/平方米”或纯文字），统一清洗为“—”
    return '—';
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

  // 渲染一人一行的项目经理表格 Body (关联项目无折叠直接挂在下面)
  const renderFlatTableBody = () => {
    return filteredManagers.map((mgr) => {
      const myProjects = projects.filter((p) => p.manager_name === mgr.name);
      
      return (
        <Fragment key={mgr.name}>
          {/* 人员基本信息行 */}
          <tr>
            <td className="py-2 position-relative">
              <span 
                className="badge px-2.5 py-1.5 fs-7 font-weight-bold border" 
                style={{ 
                  backgroundColor: mgr.status === 'idle' ? '#e8f5e9' : '#fde8e8',
                  color: mgr.status === 'idle' ? '#0f5132' : '#842029',
                  borderColor: mgr.status === 'idle' ? 'rgba(15, 81, 50, 0.2)' : 'rgba(132, 32, 41, 0.2)',
                  minWidth: '85px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  gap: '4px'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenuManagerName(activeMenuManagerName === mgr.name ? null : mgr.name);
                }}
                title="点击展示操作菜单"
              >
                {mgr.name}
                <i className="bi bi-caret-down-fill" style={{ fontSize: '0.65rem' }}></i>
              </span>

              {activeMenuManagerName === mgr.name && (
                <div 
                  className="dropdown-menu show shadow-lg border position-absolute" 
                  style={{ zIndex: 1050, left: '12px', top: '38px', minWidth: '160px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button 
                    type="button" 
                    className="dropdown-item py-2 d-flex align-items-center" 
                    onClick={() => {
                      openAddProject(mgr.name);
                      setActiveMenuManagerName(null);
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
                      setActiveMenuManagerName(null);
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
                      handleDeleteManager(mgr.name);
                      setActiveMenuManagerName(null);
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
                  backgroundColor: myProjects.some((p) => p.role === '技术负责人') ? '#0ea5e9' : '#a855f7',
                  fontWeight: 'bold',
                  fontSize: '0.8rem'
                }}
                title={myProjects.some((p) => p.role === '技术负责人') ? '技术负责人' : '项目经理'}
              >
                {myProjects.some((p) => p.role === '技术负责人') ? '技' : '项'}
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
                        backgroundColor: certLetter === 'A' ? '#fee2e2' : certLetter === 'B' ? '#dbeafe' : '#fef3c7',
                        color: certLetter === 'A' ? '#991b1b' : certLetter === 'B' ? '#1e40af' : '#78350f',
                        borderColor: certLetter === 'A' ? 'rgba(153, 27, 27, 0.2)' : certLetter === 'B' ? 'rgba(30, 64, 175, 0.2)' : 'rgba(120, 53, 15, 0.2)',
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
            <td className="py-2">
              {myProjects.length > 0 ? (
                <button
                  type="button"
                  className={`btn btn-xs rounded-pill py-0.5 px-2 d-inline-flex align-items-center gap-1 font-weight-bold ${
                    expandedManagerIds.includes(mgr.name) 
                      ? 'btn-primary text-white shadow-xs' 
                      : 'btn-outline-primary'
                  }`}
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => toggleExpandManager(mgr.name)}
                  title={expandedManagerIds.includes(mgr.name) ? '点击折叠业绩' : '点击展开业绩'}
                >
                  <span>{myProjects.length} 项</span>
                  <i className={`bi ${expandedManagerIds.includes(mgr.name) ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
                </button>
              ) : (
                <span className="badge bg-light text-muted border fs-8 px-2 py-0.5">
                  0 项
                </span>
              )}
            </td>
            <td className="py-2 small text-muted text-truncate" style={{ maxWidth: '250px' }} title={mgr.memo}>
              {mgr.memo || '—'}
            </td>
          </tr>

          {/* 关联项目条件性折叠展开挂在下面 */}
          {myProjects.length > 0 && expandedManagerIds.includes(mgr.name) && (
            <tr className="bg-light-subtle">
              <td colSpan={7} className="p-1.5 px-4 pb-2 bg-light-subtle">
                <div className="table-responsive border-0 bg-transparent">
                    <table className="table table-sm table-hover mb-0 align-middle bg-transparent text-secondary fs-9 opacity-90">
                      <thead className="table-transparent border-bottom text-muted">
                        <tr>
                          <th scope="col" className="py-1.5 px-2 text-muted fw-normal">项目名称</th>
                          <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '80px' }}>担任角色</th>
                          <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '110px' }}>建筑面积(㎡)</th>
                          <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '110px' }}>合同金额(万元)</th>
                          <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '180px' }}>开竣工时间</th>
                          <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '90px' }}>四库平台</th>
                          <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '220px' }}>人员锁证备案</th>
                          <th scope="col" className="py-1.5 px-2 text-center text-muted fw-normal" style={{ width: '60px' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myProjects.map((proj) => (
                          <tr key={proj.id} className="border-0">
                            <td className="py-1.5 px-2 text-secondary fw-semibold">{proj.project_name}</td>
                            <td className="py-1.5 px-2">
                              <span 
                                className="badge rounded-circle d-inline-flex align-items-center justify-content-center text-white" 
                                style={{ 
                                  width: '18px', 
                                  height: '18px', 
                                  backgroundColor: proj.role === '技术负责人' ? '#0ea5e9' : '#a855f7',
                                  fontWeight: 'bold',
                                  fontSize: '0.65rem'
                                }}
                              >
                                {proj.role === '技术负责人' ? '技' : '项'}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-muted">{formatAmountOrArea(proj.area)}</td>
                            <td className="py-1.5 px-2 text-muted">{formatAmountOrArea(proj.amount)}</td>
                            <td className="py-1.5 px-2 text-muted">{proj.start_date || '—'} 至 {proj.end_date || '在建'}</td>
                            <td className="py-1.5 px-2">
                              <span className={`badge ${proj.record_status === '是' ? 'bg-success-subtle text-success border-0' : 'bg-secondary-subtle text-secondary border-0'} fs-95 px-1.5 py-0.5`}>
                                {proj.record_status === '是' ? '已入库' : '未入库'}
                              </span>
                            </td>
                            <td className="py-1.5 px-2">
                              {proj.filing_status === '备案中' ? (
                                <div className="d-flex flex-column lh-sm">
                                  <div>
                                    <span className="badge bg-danger-subtle text-danger border border-danger-subtle fs-9 px-1 me-1">锁证 🔴</span>
                                    <span className="fw-semibold text-dark fs-9">{proj.filing_post || '备案中'}</span>
                                  </div>
                                  {(proj.filing_start || proj.filing_end) && (
                                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                                      {proj.filing_start || '—'} 至 {proj.filing_end || '长期'}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-success" style={{ fontSize: '0.75rem' }}>
                                  <i className="bi bi-check-circle-fill me-1"></i>空闲可投标
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <button 
                                type="button" 
                                className="btn btn-link text-danger p-0 d-inline-flex align-items-center justify-content-center"
                                style={{ textDecoration: 'none', opacity: 0.6, height: '18px', width: '18px' }}
                                onClick={() => handleDeleteProject(proj.id)}
                                title="解除该项目关联"
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                              >
                                <i className="bi bi-trash3" style={{ fontSize: '0.75rem' }}></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              </td>
            </tr>
          )}
        </Fragment>
      );
    });
  };

  // ==========================================
  // 提取数字工具函数 (用于前端规模过滤)
  // ==========================================
  const parseNum = (str: string): number => {
    if (!str) return 0;
    const match = str.match(/[\d\.]+/);
    return match ? parseFloat(match[0]) : 0;
  };

  const checkProjectCompletedYear = (endDateStr: string | null, limitYears: number): boolean => {
    if (!endDateStr) return false;
    const date = new Date(endDateStr);
    if (isNaN(date.getTime())) return false;
    const lastYear = date.getFullYear();
    const currentYear = new Date().getFullYear();
    return currentYear - lastYear <= limitYears;
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
        checkProjectCompletedYear(p.end_date, limitYears)
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
      const isOngoing = !proj.end_date;
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
    <div className="container py-3">
      {/* 头部标题与用户信息 (迷你胶囊指标整合) */}
      <header className="d-flex flex-wrap align-items-center justify-content-between pb-2 mb-3 border-bottom gap-2">
        <div>
          <h1 className="h4 text-dark font-weight-bold mb-1 d-flex align-items-center">
            <i className="bi bi-buildings-fill text-primary me-2"></i>
            一建注册项目经理业绩台账管理系统
          </h1>
          <div className="d-flex align-items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="badge bg-light text-secondary border px-2 py-1 fs-85 shadow-3xs">
              <i className="bi bi-people-fill text-primary me-1"></i>
              总人数: <strong className="text-dark">{stats.total_managers}</strong>人
            </span>
            <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 fs-85 shadow-3xs">
              <i className="bi bi-check-circle-fill text-success me-1"></i>
              空闲可投标: <strong className="text-success">{stats.idle_managers}</strong>人
            </span>
            <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1 fs-85 shadow-3xs">
              <i className="bi bi-lock-fill text-danger me-1"></i>
              锁定中: <strong className="text-danger">{stats.locked_managers}</strong>人
            </span>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {loading && (
            <span className="spinner-border spinner-border-sm text-primary me-1" role="status"></span>
          )}
          <span className="text-secondary small bg-body-tertiary p-1.5 px-2.5 rounded border fs-85">
            <i className="bi bi-person-circle text-primary me-1"></i>
            <strong>{username}</strong>
          </span>
          <button className="btn btn-xs btn-outline-danger d-flex align-items-center py-1.5 px-2.5 fs-85 rounded-pill" onClick={handleLogout}>
            <i className="bi bi-box-arrow-right me-1"></i> 退出
          </button>
        </div>
      </header>

      {/* 全局主控制与快速筛选控制栏 */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2.5 mb-3 bg-white p-2.5 border rounded shadow-2xs">
        {/* 左侧：药丸 Tab 切换器 */}
        <div className="btn-group p-1 bg-body-secondary rounded-pill" style={{ width: 'fit-content' }}>
          <button
            type="button"
            className={`btn btn-xs rounded-pill px-3 py-1.5 fs-85 font-weight-bold transition-all border-0 ${activeTab === 'manager' ? 'btn-white shadow-xs text-primary' : 'text-secondary bg-transparent'}`}
            onClick={() => {
              setActiveTab('manager');
              setShowAdvanced(false);
            }}
          >
            <i className="bi bi-person-badge-fill me-1"></i>项目经理视图
          </button>
          <button
            type="button"
            className={`btn btn-xs rounded-pill px-3 py-1.5 fs-85 font-weight-bold transition-all border-0 ${activeTab === 'project' ? 'btn-white shadow-xs text-primary' : 'text-secondary bg-transparent'}`}
            onClick={() => {
              setActiveTab('project');
              setShowAdvanced(false);
            }}
          >
            <i className="bi bi-journal-album me-1"></i>工程业绩视图
          </button>
          <button
            type="button"
            className={`btn btn-xs rounded-pill px-3 py-1.5 fs-85 font-weight-bold transition-all border-0 ${activeTab === 'dict' ? 'btn-white shadow-xs text-primary' : 'text-secondary bg-transparent'}`}
            onClick={() => {
              setActiveTab('dict');
              setShowAdvanced(false);
            }}
          >
            <i className="bi bi-gear-fill me-1"></i>基础字典参数
          </button>
        </div>

        {/* 中间：快速搜索输入框 */}
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: '400px', minWidth: '220px' }}>
          <div className="input-group input-group-sm">
            <span className="input-group-text bg-light border-end-0 text-muted"><i className="bi bi-search"></i></span>
            {activeTab === 'manager' ? (
              <input
                type="text"
                className="form-control border-start-0"
                placeholder="快速检索姓名、职称或备注说明..."
                value={mgrSearch}
                onChange={(e) => setMgrSearch(e.target.value)}
              />
            ) : activeTab === 'project' ? (
              <input
                type="text"
                className="form-control border-start-0"
                placeholder="快速检索业绩项目名称或经理姓名..."
                value={projSearch}
                onChange={(e) => setProjSearch(e.target.value)}
              />
            ) : (
              <input
                type="text"
                className="form-control border-start-0 bg-light-subtle"
                placeholder="当前在参数字典视图，无需检索"
                disabled
              />
            )}
          </div>
        </div>

        {/* 右侧：功能按钮组 (高级筛选 Toggle、新增按钮、刷新) */}
        <div className="d-flex align-items-center gap-2">
          {activeTab !== 'dict' && (
            <button
              type="button"
              className={`btn btn-xs d-flex align-items-center py-1.5 px-3 rounded-pill fs-85 ${showAdvanced ? 'btn-primary text-white' : 'btn-outline-secondary'}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <i className="bi bi-funnel me-1"></i>
              高级筛选 {showAdvanced ? '收起 ▴' : '展开 ▾'}
            </button>
          )}
          {activeTab === 'manager' ? (
            <button className="btn btn-xs btn-primary d-flex align-items-center py-1.5 px-3 rounded-pill fs-85" onClick={openAddManager}>
              <i className="bi bi-person-plus-fill me-1"></i> 新增人员
            </button>
          ) : activeTab === 'project' ? (
            <button className="btn btn-xs btn-primary d-flex align-items-center py-1.5 px-3 rounded-pill fs-85" onClick={() => openAddProject('')}>
              <i className="bi bi-plus-circle-fill me-1"></i> 新增业绩
            </button>
          ) : null}
          <button className="btn btn-xs btn-outline-primary d-flex align-items-center p-1.5 rounded-circle" onClick={fetchAllData} disabled={loading} title="刷新数据">
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>
      </div>
      {/* 主体展示区 */}
      {error && <div className="alert alert-danger shadow-sm"><i className="bi bi-exclamation-triangle-fill me-2"></i>{error}</div>}

      {activeTab === 'manager' ? (
        // ==========================================
        // 视图一：项目经理视图
        // ==========================================
        <div>
          {/* 筛选面板 */}
          {/* 高级多维筛选面板 (受 showAdvanced 控制展开) */}
          {showAdvanced && (
            <div className="card border-0 shadow-2xs p-3.5 mb-3 bg-body-tertiary rounded-3">
              <div className="row g-2.5">
                <div className="col-6 col-md-3">
                  <select
                    className="form-select form-select-sm"
                    value={mgrStatus}
                    onChange={(e) => setMgrStatus(e.target.value)}
                  >
                    <option value="all">人员状态 (全部)</option>
                    <option value="idle">🟢 空闲 (可投标)</option>
                    <option value="locked">🔴 锁定 (不可投标)</option>
                  </select>
                </div>
                <div className="col-6 col-md-3">
                  <select
                    className="form-select form-select-sm"
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
                <div className="col-12 col-md-4">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="检索证书专业 (如: 建筑/市政)..."
                    value={mgrCertMajor}
                    onChange={(e) => setMgrCertMajor(e.target.value)}
                  />
                </div>
                <div className="col-12 col-md-2">
                  <button
                    className="btn btn-sm btn-outline-secondary w-100"
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
              <div className="row g-2.5 mt-2 border-top pt-2.5">
                <div className="col-6 col-md-4">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-transparent text-muted small fs-8">单笔业绩金额</span>
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
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-transparent text-muted small fs-8">单笔项目面积</span>
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
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-transparent text-muted small fs-8">业绩竣工年份</span>
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
          )}

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
            <div className="table-responsive border shadow-sm rounded bg-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
              <table className="table table-striped table-hover align-middle mb-0 fs-8" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead className="table-light sticky-top" style={{ zIndex: 10, top: 0 }}>
                  <tr>
                    <th scope="col" className="py-2.5" style={{ width: '110px' }}>姓名</th>
                    <th scope="col" className="py-2.5" style={{ width: '75px' }}>人员类型</th>
                    <th scope="col" className="py-2.5" style={{ width: '160px' }}>注册专业</th>
                    <th scope="col" className="py-2.5" style={{ width: '180px' }}>职称专业</th>
                    <th scope="col" className="py-2.5" style={{ width: '80px' }}>安考证书</th>
                    <th scope="col" className="py-2.5 text-center" style={{ width: '95px' }}>名下业绩</th>
                    <th scope="col" className="py-2.5">备注说明</th>
                  </tr>
                </thead>
                <tbody>
                  {renderFlatTableBody()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'project' ? (
        // ==========================================
        // 视图二：工程业绩视图
        // ==========================================
        <div>
          {/* 筛选面板 */}
          {/* 业绩高级多维筛选面板 (受 showAdvanced 控制展开) */}
          {showAdvanced && (
            <div className="card border-0 shadow-2xs p-3.5 mb-3 bg-body-tertiary rounded-3">
              <div className="row g-2.5">
                <div className="col-6 col-md-3">
                  <select
                    className="form-select form-select-sm"
                    value={projRole}
                    onChange={(e) => setProjRole(e.target.value)}
                  >
                    <option value="all">担任职位 (全部)</option>
                    <option value="项目经理">项目经理</option>
                    <option value="技术负责人">技术负责人</option>
                  </select>
                </div>
                <div className="col-6 col-md-3">
                  <select
                    className="form-select form-select-sm"
                    value={projRecord}
                    onChange={(e) => setProjRecord(e.target.value)}
                  >
                    <option value="all">四库平台 (全部)</option>
                    <option value="已备案">已备案</option>
                    <option value="无">未备案</option>
                  </select>
                </div>
                <div className="col-12 col-md-4">
                  <select
                    className="form-select form-select-sm"
                    value={projMgrStatus}
                    onChange={(e) => setProjMgrStatus(e.target.value)}
                  >
                    <option value="all">对应负责人状态 (全部)</option>
                    <option value="idle">🟢 负责人当前空闲 (该业绩可用)</option>
                    <option value="locked">🔴 负责人已被锁在别处 (该业绩不可用)</option>
                  </select>
                </div>
                <div className="col-12 col-md-2">
                  <button
                    className="btn btn-sm btn-outline-secondary w-100"
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
              <div className="row g-2.5 mt-2 border-top pt-2.5">
                <div className="col-6 col-md-4">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-transparent text-muted small fs-8">单笔项目金额</span>
                    <select
                      className="form-select"
                      value={projMinAmount}
                      onChange={(e) => setProjMinAmount(e.target.value)}
                    >
                      <option value="all">金额无限制</option>
                      <option value="3000">&gt;= 3000 万元</option>
                      <option value="5000">&gt;= 5000 万元</option>
                      <option value="10000">&gt;= 1 亿元</option>
                    </select>
                  </div>
                </div>
                <div className="col-6 col-md-4">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-transparent text-muted small fs-8">单笔项目面积</span>
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
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-transparent text-muted small fs-8">项目时间状态</span>
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
          )}

          {/* 项目展示列表 (大表 Table 改版) */}
          {(() => {
            const groupedMap: { [key: string]: {
              project_name: string;
              amount: string;
              area: string;
              start_date: string;
              end_date: string;
              record_status: string;
              filing_status: string;
              filing_end: string;
              staffs: {
                id: number;
                manager_name: string;
                role: string;
                safety_cert: string;
                manager_status: string;
                raw_project: any;
                filing_status: string;
                filing_post: string;
                filing_start: string;
                filing_end: string;
              }[];
            } } = {};

            filteredProjects.forEach((p) => {
              const key = p.project_name;
              if (!groupedMap[key]) {
                groupedMap[key] = {
                  project_name: p.project_name,
                  amount: p.amount || '—',
                  area: p.area || '—',
                  start_date: p.start_date || '—',
                  end_date: p.end_date || '—',
                  record_status: p.record_status || '无',
                  filing_status: p.filing_status || '',
                  filing_end: p.filing_end || '',
                  staffs: [],
                };
              }
              const mDetail = managers.find((m) => m.name === p.manager_name);
              groupedMap[key].staffs.push({
                id: p.id,
                manager_name: p.manager_name,
                role: p.role,
                safety_cert: mDetail ? mDetail.safety_cert : '',
                manager_status: p.manager_status,
                raw_project: p,
                filing_status: p.filing_status || '',
                filing_post: p.filing_post || '',
                filing_start: p.filing_start || '',
                filing_end: p.filing_end || '',
              });
            });

            const groupedList = Object.values(groupedMap);

            return (
              <>
                <div className="text-secondary mb-3 small d-flex align-items-center justify-content-between">
                  <span>找到 {groupedList.length} 个合并工程项目 (共包含 {filteredProjects.length} 条岗位记录)</span>
                  <button className="btn btn-xs btn-outline-primary d-flex align-items-center py-1.5 px-2.5 rounded-pill fs-85" onClick={fetchAllData}>
                    <i className="bi bi-arrow-clockwise me-1"></i> 刷新数据
                  </button>
                </div>

                {groupedList.length === 0 ? (
                  <div className="card text-center p-5 border-0 bg-light shadow-sm">
                    <p className="lead mb-0 text-muted">🏗️ 暂无符合筛选条件的工程项目</p>
                  </div>
                ) : (
                  <div className="table-responsive border shadow-sm rounded bg-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                    <table className="table table-striped table-hover align-middle mb-0 fs-8" style={{ tableLayout: 'fixed', width: '100%' }}>
                      <thead className="table-light sticky-top" style={{ zIndex: 10, top: 0 }}>
                        <tr>
                          <th scope="col" className="py-2.5" style={{ width: '280px' }}>项目名称</th>
                          <th scope="col" className="py-2.5" style={{ width: '120px' }}>合同金额(万元)</th>
                          <th scope="col" className="py-2.5" style={{ width: '120px' }}>建筑面积(㎡)</th>
                          <th scope="col" className="py-2.5" style={{ width: '180px' }}>开竣工时间</th>
                          <th scope="col" className="py-2.5" style={{ width: '90px' }}>四库平台</th>
                          <th scope="col" className="py-2.5 text-center" style={{ width: '95px' }}>参建人员</th>
                          <th scope="col" className="py-2.5">备案/备注说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedList.map((gp, gIdx) => {
                          const isExpanded = expandedProjectNames.includes(gp.project_name);
                          return (
                            <Fragment key={gIdx}>
                              {/* 项目主信息行 */}
                              <tr>
                                <td className="py-2 font-weight-bold text-dark text-truncate" title={gp.project_name}>
                                  <span className="me-1">{gp.project_name}</span>
                                  {gp.staffs.length > 0 && (
                                    <button
                                      type="button"
                                      className="btn btn-link text-primary p-0 opacity-50 btn-xs"
                                      onClick={() => openEditProject(gp.staffs[0].raw_project)}
                                      title="修改项目信息"
                                      style={{ textDecoration: 'none' }}
                                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
                                    >
                                      <i className="bi bi-pencil-square"></i>
                                    </button>
                                  )}
                                </td>
                                <td className="py-2 text-secondary">{formatAmountOrArea(gp.amount)}</td>
                                <td className="py-2 text-secondary">{formatAmountOrArea(gp.area)}</td>
                                <td className="py-2 text-secondary">{gp.start_date || '—'} 至 {gp.end_date || '在建'}</td>
                                <td className="py-2">
                                  <span className={`badge ${gp.record_status === '已备案' || gp.record_status === '已入库' || gp.record_status === '是' ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary border border-secondary-subtle'} fs-9`}>
                                    {gp.record_status}
                                  </span>
                                </td>
                                <td className="py-2">
                                  {gp.staffs.length > 0 ? (
                                    <button
                                      type="button"
                                      className={`btn btn-xs rounded-pill py-0.5 px-2 d-inline-flex align-items-center gap-1 font-weight-bold ${
                                        isExpanded 
                                          ? 'btn-primary text-white shadow-xs' 
                                          : 'btn-outline-primary'
                                      }`}
                                      style={{ fontSize: '0.75rem' }}
                                      onClick={() => toggleExpandProject(gp.project_name)}
                                      title={isExpanded ? '点击折叠人员' : '点击展开人员'}
                                    >
                                      <span>{gp.staffs.length} 人</span>
                                      <i className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
                                    </button>
                                  ) : (
                                    <span className="badge bg-light text-muted border fs-8 px-2 py-0.5">
                                      0 人
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 small text-muted text-truncate" style={{ maxWidth: '250px' }}>
                                  {gp.staffs.filter((st) => st.filing_status === '备案中').length > 0 ? (
                                    gp.staffs
                                      .filter((st) => st.filing_status === '备案中')
                                      .map((st) => (
                                        <div key={st.id} className="lh-sm mb-1">
                                          <span className="badge bg-danger-subtle text-danger border border-danger-subtle fs-9 me-1">
                                            {st.manager_name} 锁
                                          </span>
                                          <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                            {st.filing_end ? `到 ${st.filing_end}` : '在建中'}
                                          </span>
                                        </div>
                                      ))
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                              </tr>

                              {/* 参建人员明细子表 (下挂折叠) */}
                              {gp.staffs.length > 0 && isExpanded && (
                                <tr className="bg-light-subtle">
                                  <td colSpan={7} className="p-1.5 px-4 pb-2 bg-light-subtle">
                                    <div className="table-responsive border-0 bg-transparent">
                                      <table className="table table-sm table-hover mb-0 align-middle bg-transparent text-secondary fs-9 opacity-90">
                                        <thead className="table-transparent border-bottom text-muted">
                                          <tr>
                                            <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '110px' }}>名字</th>
                                            <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '80px' }}>担任角色</th>
                                            <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '100px' }}>注册专业</th>
                                            <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '80px' }}>安考证书</th>
                                            <th scope="col" className="py-1.5 px-2 text-muted fw-normal" style={{ width: '220px' }}>人员锁证备案</th>
                                            <th scope="col" className="py-1.5 px-2 text-center text-muted fw-normal" style={{ width: '60px' }}>操作</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {gp.staffs.map((st) => {
                                            const stSafety = st.safety_cert ? st.safety_cert.replace('证', '').trim().toUpperCase() : '';
                                            return (
                                              <tr key={st.id} className="border-0">
                                                <td className="py-1.5 px-2">
                                                  <span 
                                                    className="badge px-2 py-1 fs-9 font-weight-bold border"
                                                    style={{
                                                      backgroundColor: st.manager_status === 'idle' ? '#e8f5e9' : '#fde8e8',
                                                      color: st.manager_status === 'idle' ? '#0f5132' : '#842029',
                                                      borderColor: st.manager_status === 'idle' ? 'rgba(15, 81, 50, 0.2)' : 'rgba(132, 32, 41, 0.2)',
                                                      minWidth: '70px',
                                                      display: 'inline-flex',
                                                      alignItems: 'center',
                                                      justifyContent: 'center'
                                                    }}
                                                  >
                                                    {st.manager_name}
                                                  </span>
                                                </td>
                                                <td className="py-1.5 px-2">
                                                  <span 
                                                    className="badge rounded-circle d-inline-flex align-items-center justify-content-center text-white" 
                                                    style={{ 
                                                      width: '18px', 
                                                      height: '18px', 
                                                      backgroundColor: st.role === '技术负责人' ? '#0ea5e9' : '#a855f7',
                                                      fontWeight: 'bold',
                                                      fontSize: '0.65rem'
                                                    }}
                                                  >
                                                    {getRoleAbbr(st.role)}
                                                  </span>
                                                </td>
                                                <td className="py-1.5 px-2 text-muted">
                                                  {getCertMajorAbbr(st.manager_name)}
                                                </td>
                                                <td className="py-1.5 px-2">
                                                  {stSafety ? (
                                                    <span 
                                                      className="badge rounded-circle d-inline-flex align-items-center justify-content-center border" 
                                                      style={{ 
                                                        width: '18px', 
                                                        height: '18px', 
                                                        backgroundColor: stSafety === 'A' ? '#fee2e2' : stSafety === 'B' ? '#dbeafe' : '#fef3c7',
                                                        color: stSafety === 'A' ? '#991b1b' : stSafety === 'B' ? '#1e40af' : '#78350f',
                                                        borderColor: stSafety === 'A' ? 'rgba(153, 27, 27, 0.2)' : stSafety === 'B' ? 'rgba(30, 64, 175, 0.2)' : 'rgba(120, 53, 15, 0.2)',
                                                        fontWeight: 'bold',
                                                        fontSize: '0.65rem'
                                                      }}
                                                    >
                                                      {stSafety}
                                                    </span>
                                                  ) : '—'}
                                                </td>
                                                <td className="py-1.5 px-2">
                                                  {st.filing_status === '备案中' ? (
                                                    <div className="d-flex flex-column lh-sm">
                                                      <div>
                                                        <span className="badge bg-danger-subtle text-danger border border-danger-subtle fs-9 px-1 me-1">锁证 🔴</span>
                                                        <span className="fw-semibold text-dark fs-9">{st.filing_post || '备案中'}</span>
                                                      </div>
                                                      {(st.filing_start || st.filing_end) && (
                                                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                          {st.filing_start || '—'} 至 {st.filing_end || '长期'}
                                                        </span>
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <span className="text-success" style={{ fontSize: '0.75rem' }}>
                                                      <i className="bi bi-check-circle-fill me-1"></i>空闲可投标
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="py-1.5 px-2 text-center">
                                                  <button 
                                                    type="button" 
                                                    className="btn btn-link text-danger p-0 d-inline-flex align-items-center justify-content-center"
                                                    style={{ textDecoration: 'none', opacity: 0.6, height: '18px', width: '18px' }}
                                                    onClick={() => handleDeleteProject(st.id)}
                                                    title="解除该岗位关联"
                                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                                                  >
                                                    <i className="bi bi-trash3" style={{ fontSize: '0.75rem' }}></i>
                                                  </button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        <DictionaryManagerPanel 
          dictionaries={dictionaries}
          onSave={handleSaveDictionary}
          onDelete={handleDeleteDictionary}
          onOpenAuditLogs={openLogsModal}
        />
      )}

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
                    <div className="col-4">
                      <label className="form-label">职称</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="如: 高级工程师"
                        value={mgrForm.title}
                        onChange={(e) => setMgrForm({ ...mgrForm, title: e.target.value })}
                        list="titleList"
                      />
                      <datalist id="titleList">
                        {dictionaries.filter(d => d.type === 'title').map(d => (
                          <option key={d.id} value={d.value} />
                        ))}
                      </datalist>
                    </div>
                    <div className="col-4">
                      <label className="form-label">职称专业</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="如: 建筑工程"
                        value={mgrForm.title_major}
                        onChange={(e) => setMgrForm({ ...mgrForm, title_major: e.target.value })}
                        list="titleMajorList"
                      />
                      <datalist id="titleMajorList">
                        {dictionaries.filter(d => d.type === 'title_major').map(d => (
                          <option key={d.id} value={d.value} />
                        ))}
                      </datalist>
                    </div>
                    <div className="col-4">
                      <label className="form-label">发证日期</label>
                      <input
                        type="date"
                        className="form-control"
                        value={mgrForm.title_date}
                        onChange={(e) => setMgrForm({ ...mgrForm, title_date: e.target.value })}
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
                    <label className="form-label font-weight-bold">证书注册专业 <span className="text-muted fs-85">(可直接输入，或点击下方标签快捷勾选)</span></label>
                    <input
                      type="text"
                      className="form-control mb-2"
                      placeholder="多专业用半角逗号隔开，如: 建筑工程,机电工程"
                      value={mgrForm.cert_major}
                      onChange={(e) => setMgrForm({ ...mgrForm, cert_major: e.target.value })}
                    />
                    <div className="d-flex flex-wrap gap-1.5 mt-1">
                      {dictionaries.filter(d => d.type === 'cert_major').map(d => {
                        const isSelected = mgrForm.cert_major
                          .split(',')
                          .map(m => m.trim())
                          .includes(d.value);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            className={`btn btn-xs rounded-pill px-2.5 py-1 d-flex align-items-center gap-1 border transition-all ${
                              isSelected 
                                ? 'btn-primary text-white border-primary shadow-xs' 
                                : 'btn-light text-secondary bg-light-subtle'
                            }`}
                            onClick={() => {
                              const currentMajors = mgrForm.cert_major
                                .split(',')
                                .map(m => m.trim())
                                .filter(Boolean);
                              if (currentMajors.includes(d.value)) {
                                const updated = currentMajors.filter(m => m !== d.value).join(',');
                                setMgrForm({ ...mgrForm, cert_major: updated });
                              } else {
                                currentMajors.push(d.value);
                                setMgrForm({ ...mgrForm, cert_major: currentMajors.join(',') });
                              }
                            }}
                          >
                            <i className={`bi ${isSelected ? 'bi-dash-lg' : 'bi-plus-lg'}`}></i>
                            <span>{d.value}</span>
                          </button>
                        );
                      })}
                    </div>
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
                    {!editingProject && targetManagerName !== '' ? (
                      <select
                        className="form-select"
                        value={projForm.project_name}
                        onChange={(e) => setProjForm({ ...projForm, project_name: e.target.value })}
                        required
                      >
                        <option value="">-- 请选择系统内已有的工程项目 (防止重名分裂) --</option>
                        {Array.from(new Set(projects.map((p) => p.project_name)))
                          .filter(Boolean)
                          .sort()
                          .map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))
                        }
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="form-control"
                        placeholder="请输入完整工程项目名称"
                        value={projForm.project_name}
                        onChange={(e) => setProjForm({ ...projForm, project_name: e.target.value })}
                        required
                        list="projectNameList"
                      />
                    )}
                    <datalist id="projectNameList">
                      {Array.from(new Set(projects.map((p) => p.project_name)))
                        .filter(Boolean)
                        .sort()
                        .map((name) => (
                          <option key={name} value={name} />
                        ))
                      }
                    </datalist>
                  </div>
                  <div className="row mb-3">
                    <div className="col-4">
                      <label className="form-label">担任职务</label>
                      <select
                        className="form-select"
                        value={projForm.role}
                        onChange={(e) => setProjForm({ ...projForm, role: e.target.value })}
                      >
                        {dictionaries.filter(d => d.type === 'role').map(d => (
                          <option key={d.id} value={d.value}>{d.value}</option>
                        ))}
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
                    <div className="col-4">
                      <label className="form-label">开工日期</label>
                      <input
                        type="date"
                        className="form-control"
                        value={projForm.start_date}
                        onChange={(e) => setProjForm({ ...projForm, start_date: e.target.value })}
                      />
                    </div>
                    <div className="col-4">
                      <label className="form-label">竣工日期</label>
                      <input
                        type="date"
                        className="form-control"
                        value={projForm.end_date}
                        disabled={!projForm.end_date}
                        onChange={(e) => setProjForm({ ...projForm, end_date: e.target.value })}
                      />
                    </div>
                    <div className="col-4 d-flex align-items-end pb-2">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="isOngoingCheckbox"
                          checked={!projForm.end_date}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setProjForm({ ...projForm, end_date: '' });
                            } else {
                              setProjForm({ ...projForm, end_date: new Date().toISOString().split('T')[0] });
                            }
                          }}
                        />
                        <label className="form-check-label font-weight-bold text-primary small" htmlFor="isOngoingCheckbox">
                          🏗️ 仍在建 (竣工无期限)
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="row mb-3">
                    <div className="col-12">
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

interface DictionaryManagerPanelProps {
  dictionaries: DictionaryItem[];
  onSave: (type: string, value: string, editId: number | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onOpenAuditLogs: () => void;
}

function DictionaryManagerPanel({ dictionaries, onSave, onDelete, onOpenAuditLogs }: DictionaryManagerPanelProps) {
  const [selectedType, setSelectedType] = useState<string>('cert_major');
  const [newValue, setNewValue] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const types = [
    { key: 'cert_major', label: '执业注册专业', icon: 'bi-patch-check-fill', color: 'text-success' },
    { key: 'title_major', label: '职称专业', icon: 'bi-mortarboard-fill', color: 'text-primary' },
    { key: 'title', label: '职称等级', icon: 'bi-award-fill', color: 'text-warning' },
    { key: 'role', label: '参建工程岗位', icon: 'bi-briefcase-fill', color: 'text-info' },
  ];

  const currentItems = dictionaries.filter((d) => d.type === selectedType);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) return;
    await onSave(selectedType, newValue.trim(), null);
    setNewValue('');
  };

  const handleStartEdit = (item: DictionaryItem) => {
    setEditingId(item.id);
    setEditingValue(item.value);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const handleSaveEdit = async (item: DictionaryItem) => {
    if (!editingValue.trim()) return;
    if (editingValue.trim() === item.value) {
      handleCancelEdit();
      return;
    }
    await onSave(selectedType, editingValue.trim(), item.id);
    handleCancelEdit();
  };

  return (
    <div className="row g-3">
      {/* 左侧：类型列表 */}
      <div className="col-12 col-md-3">
        <div className="card border-0 shadow-2xs p-2 bg-white rounded-3">
          <div className="nav flex-column nav-pills" role="tablist">
            {types.map((t) => (
              <button
                key={t.key}
                className={`nav-link text-start py-2.5 px-3 mb-1.5 rounded-3 d-flex align-items-center gap-2 transition-all border-0 fs-85 ${
                  selectedType === t.key
                    ? 'active bg-primary-subtle text-primary fw-bold shadow-2xs'
                    : 'text-secondary bg-transparent hover-bg-light'
                }`}
                onClick={() => {
                  setSelectedType(t.key);
                  handleCancelEdit();
                }}
              >
                <i className={`bi ${t.icon} ${t.color}`}></i>
                <span>{t.label}</span>
                <span className="badge rounded-pill bg-light text-secondary ms-auto fs-9">
                  {dictionaries.filter((d) => d.type === t.key).length}
                </span>
              </button>
            ))}
          </div>
          <div className="border-top my-2 pt-2 px-1">
            <button
              type="button"
              className="btn btn-xs btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-1.5 py-2 rounded-3 fs-8 mb-1 transition-all"
              onClick={onOpenAuditLogs}
            >
              <i className="bi bi-shield-shaded text-info"></i>
              <span>查看系统变更审计日志</span>
            </button>
          </div>
        </div>
      </div>

      {/* 右侧：列表编辑 */}
      <div className="col-12 col-md-9">
        <div className="card border-0 shadow-2xs p-3.5 bg-white rounded-3">
          <form onSubmit={handleAdd} className="mb-3.5">
            <label className="form-label font-weight-bold fs-7 text-dark mb-2">
              新增 {types.find((t) => t.key === selectedType)?.label} 选项
            </label>
            <div className="input-group input-group-sm">
              <input
                type="text"
                className="form-control"
                placeholder={`输入要添加的字典选项值...`}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                required
              />
              <button className="btn btn-primary d-flex align-items-center gap-1.5 px-3" type="submit">
                <i className="bi bi-plus-circle"></i>
                <span>添加</span>
              </button>
            </div>
          </form>

          <div className="table-responsive border rounded-3 bg-body" style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
            <table className="table table-striped table-hover align-middle mb-0 fs-85">
              <thead className="table-light sticky-top" style={{ top: 0, zIndex: 5 }}>
                <tr>
                  <th scope="col" className="py-2 px-3">选项值</th>
                  <th scope="col" className="py-2 px-3 text-end" style={{ width: '150px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="text-center py-4 text-muted">
                      💡 当前类型下暂无参数，请在上方录入新增
                    </td>
                  </tr>
                ) : (
                  currentItems.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 px-3">
                        {editingId === item.id ? (
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(item);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className="font-weight-bold text-dark">{item.value}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-end">
                        {editingId === item.id ? (
                          <div className="d-inline-flex gap-1.5">
                            <button
                              type="button"
                              className="btn btn-xs btn-success rounded-pill py-1 px-2.5"
                              onClick={() => handleSaveEdit(item)}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-outline-secondary rounded-pill py-1 px-2.5"
                              onClick={handleCancelEdit}
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="d-inline-flex gap-2">
                            <button
                              type="button"
                              className="btn btn-link text-secondary p-0 btn-xs border-0 bg-transparent"
                              title="点击编辑"
                              onClick={() => handleStartEdit(item)}
                            >
                              <i className="bi bi-pencil-square fs-75 text-secondary"></i>
                            </button>
                            <button
                              type="button"
                              className="btn btn-link text-danger p-0 btn-xs border-0 bg-transparent"
                              title="删除"
                              onClick={() => onDelete(item.id)}
                            >
                              <i className="bi bi-trash3 fs-75 text-danger"></i>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
