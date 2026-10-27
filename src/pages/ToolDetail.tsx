import { useState, useRef, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { tools } from '../data/tools';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../contexts/ToastContext';
import { apiFetch, apiFetchWithTimeout } from '../lib/api';

const API_BASE = '';

const gradientMap: Record<string, string> = {
  blue: 'gradient-card-blue',
  cyan: 'gradient-card-cyan',
  purple: 'gradient-card-purple',
  orange: 'gradient-card-orange',
  green: 'gradient-card-green',
};

const tagColorMap: Record<string, string> = {
  Finance: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  Check: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
  AI: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
  Reminder: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  OA: 'bg-accent-green/10 text-accent-green border-accent-green/20',
};

const statColorMap: Record<string, string> = {
  blue: 'text-accent-blue',
  cyan: 'text-accent-cyan',
  purple: 'text-accent-purple',
  orange: 'text-orange-400',
  green: 'text-accent-green',
};

const featureIconBgMap: Record<string, string> = {
  blue: 'bg-accent-blue/10',
  cyan: 'bg-accent-cyan/10',
  purple: 'bg-accent-purple/10',
  orange: 'bg-orange-500/10',
  green: 'bg-accent-green/10',
};

const featureIconColorMap: Record<string, string> = {
  blue: 'text-accent-blue',
  cyan: 'text-accent-cyan',
  purple: 'text-accent-purple',
  orange: 'text-orange-400',
  green: 'text-accent-green',
};

const runBtnColorMap: Record<string, string> = {
  blue: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30 hover:bg-accent-blue/30 shadow-lg shadow-accent-blue/10',
  cyan: 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30 hover:bg-accent-cyan/30 shadow-lg shadow-accent-cyan/10',
  purple: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30 hover:bg-accent-purple/30 shadow-lg shadow-accent-purple/10',
  orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30 shadow-lg shadow-orange-500/10',
  green: 'bg-accent-green/20 text-accent-green border-accent-green/30 hover:bg-accent-green/30 shadow-lg shadow-accent-green/10',
};

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const defaultEnd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const defaultStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;

export default function ToolDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tool = tools.find((t) => t.id === id);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [resultType, setResultType] = useState<'success' | 'error' | null>(null);
  const [callCount, setCallCount] = useState(tool?.callCount || 0);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearResultRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();
  const isSubsidy = id === 'subsidy-tracking';
  const isFreeze = id === 'settlement-freeze';
  const isGrossProfit = id === 'settlement-gross-profit';
  const isAdjust = id === 'settlement-adjust';
  const isOA = id === 'oa-approval';
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || defaultStart);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || defaultEnd);
  const [oaContent, setOaContent] = useState(searchParams.get('content') || '');
  const [oaAttachment, setOaAttachment] = useState('');
  const [oaFileName, setOaFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOaFileName(file.name);
    addToast({ type: 'success', title: '正在解析...', message: file.name, duration: 2000 });

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      // 动态导入xlsx，避免首屏加载大库，且不阻塞主线程
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      // 延迟一下让UI更新
      await new Promise(r => setTimeout(r, 50));
      try {
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', bookDeps: true });
        let text = '';
        for (const name of wb.SheetNames) {
          text += `=== ${name} ===\n`;
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
          text += csv + '\n';
        }
        setOaAttachment(text);
        addToast({ type: 'success', title: 'Excel已解析', message: `${file.name} (${wb.SheetNames.length}表)`, duration: 3000 });
      } catch (err) {
        addToast({ type: 'error', title: '解析失败', message: `无法解析: ${err}`, duration: 4000 });
      }
    } else if (ext === 'csv' || ext === 'txt') {
      const text = await file.text();
      setOaAttachment(text);
      addToast({ type: 'success', title: '文件已读取', message: file.name, duration: 3000 });
    } else {
      addToast({ type: 'error', title: '不支持', message: '请上传 xlsx/xls/csv/txt', duration: 4000 });
      setOaFileName('');
    }
  };
  const [oaResult, setOaResult] = useState<{
    success: boolean;
    oa_type?: string;
    matched?: boolean;
    summary?: Record<string, unknown>;
    opinion?: string;
    learned?: boolean;
    new_type_id?: string;
    error?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    checkInitialStatus();
    fetchCallCount();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (logRef.current) clearInterval(logRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (clearResultRef.current) clearTimeout(clearResultRef.current);
    };
    // 初始状态检查仅在挂载时执行一次，函数定义在下方（闭包在渲染后可用）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // OA审批：一劳永逸 —— 只要完成就自动拉取结果
  useEffect(() => {
    if (isOA && resultType === 'success') {
      fetchOAResult();
    }
    // fetchOAResult 每次渲染重建，加入依赖会导致该 effect 反复执行，故按语义仅依赖触发条件
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultType, isOA]);

  const checkInitialStatus = async () => {
    if (!tool) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/tools/${tool.id}/status`);
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.running) {
        setRunning(true);
        setRunMsg(data.message || '运行中...');
        startStatusPolling();
      } else if (data.exitCode !== undefined) {
        if (data.exitCode === 0) {
          setResultType('success');
          setRunMsg(data.message || '已完成');
          // OA审批：加载已有结果
          if (isOA) fetchOAResult();
        } else {
          setResultType('error');
          setRunMsg(data.message || '失败');
        }
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) { setResultType(null); setRunMsg(''); }
        }, 5000);
      }
    } catch {
      // 后端不可用
    }
  };

  const fetchOAResult = async () => {
    if (!tool) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/tools/${tool.id}/result`);
      const data = await res.json();
      if (mountedRef.current && data) {
        setOaResult(data);
      }
    } catch {
      // 后端不可用
    }
  };

  const fetchCallCount = async () => {
    if (!tool) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/tools/${tool.id}/call-count`);
      const data = await res.json();
      if (mountedRef.current) {
        setCallCount(data.count || 0);
      }
    } catch {
      // 后端不可用
    }
  };

  const startStatusPolling = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (logRef.current) clearInterval(logRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // 5分钟超时 — 防止 close 事件不触发导致状态卡死
    timeoutRef.current = setTimeout(() => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (logRef.current) {
        clearInterval(logRef.current);
        logRef.current = null;
      }
      if (mountedRef.current) {
        setRunning(false);
        setResultType('error');
        setRunMsg('运行超时，但可能已完成（请检查飞书）');
        setTimeout(() => {
          if (mountedRef.current) { setResultType(null); setRunMsg(''); setLogs([]); }
        }, 8000);
      }
    }, 5 * 60 * 1000);

    // 状态轮询（带重试计数和错误处理，一劳永逸）
    // in-flight 标记：上一轮没回来就跳过本轮，避免请求叠加把浏览器 6 个连接占满
    let pollFailCount = 0;
    let statusInFlight = false;
    let logInFlight = false;
    const MAX_POLL_FAILS = 5;
    timerRef.current = setInterval(async () => {
      if (!tool || statusInFlight) return;
      statusInFlight = true;
      try {
        const res = await apiFetchWithTimeout(`${API_BASE}/api/tools/${tool.id}/status?_t=${Date.now()}`, { cache: 'no-store' }, 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        pollFailCount = 0;
        if (!mountedRef.current) return;
        if (!data.running) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          if (logRef.current) { clearInterval(logRef.current); logRef.current = null; }
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
          setRunning(false);
          if (data.exitCode === 0) {
            setResultType('success');
            setRunMsg(data.message || '运行完成');
            addToast({ type: 'success', title: tool.name, message: '运行完成，已导出并发送飞书', duration: 6000 });
          } else if (data.exitCode !== undefined) {
            setResultType('error');
            setRunMsg(data.message || '运行失败');
            addToast({ type: 'error', title: tool.name, message: data.message || '运行失败，请查看日志', duration: 8000 });
          } else {
            // 进程已退出但无 exitCode（可能已完成超过5分钟），视为成功
            setResultType('success');
            setRunMsg('已完成（请检查飞书）');
            addToast({ type: 'success', title: tool.name, message: '任务已完成，请检查飞书通知', duration: 6000 });
          }
          // 更新运行次数
          fetchCallCount();
          // OA审批：拉取结构化结果
          if (isOA && data.exitCode === 0) {
            fetchOAResult();
          }
          // 结果保持显示30秒
          if (clearResultRef.current) clearTimeout(clearResultRef.current);
          clearResultRef.current = setTimeout(() => {
            if (mountedRef.current) { setResultType(null); setRunMsg(''); setLogs([]); }
          }, 30000);
        } else {
          setRunMsg(data.message || '运行中...');
        }
      } catch (e) {
        pollFailCount++;
        console.error(`[StatusPoll] Fetch error (${pollFailCount}/${MAX_POLL_FAILS}):`, e);
        if (pollFailCount >= MAX_POLL_FAILS) {
          // 连续失败太多次，停止轮询并提示用户
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          if (logRef.current) { clearInterval(logRef.current); logRef.current = null; }
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
          if (mountedRef.current) {
            setRunning(false);
            setResultType('error');
            setRunMsg('后端连接失败，请刷新页面重试');
            addToast({ type: 'error', title: tool.name, message: '后端连接失败，请刷新页面后重试', duration: 8000 });
          }
        }
      } finally {
        statusInFlight = false;
      }
    }, 2000) as unknown as ReturnType<typeof setTimeout>;

    logRef.current = setInterval(async () => {
      if (!tool || logInFlight) return;
      logInFlight = true;
      try {
        const res = await apiFetchWithTimeout(`${API_BASE}/api/tools/${tool.id}/logs`, {}, 8000);
        const data = await res.json();
        if (!mountedRef.current) return;
        if (data.logs && data.logs.length > 0) {
          setLogs(data.logs);
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        }
      } catch (e) {
        console.error('[LogPoll] Fetch error:', e);
      } finally {
        logInFlight = false;
      }
    }, 1000);
  };

  const handleRun = async () => {
    if (running || !tool) return;
    setRunning(true);
    setRunMsg('启动中...');
    setResultType(null);
    setLogs([]);
    try {
      // OA审批：通过后端 /api/tools/oa-approval/analyze 调用 AI
      // （DeepSeek 密钥仅存在于后端 .env，不暴露到前端）
      if (isOA) {
        if (!oaContent.trim()) {
          addToast({ type: 'error', title: '请粘贴OA内容', message: '请先将OA页面内容粘贴到输入框中', duration: 4000 });
          return;
        }
        setResultType(null);
        setOaResult(null);
        setRunning(true);
        setRunMsg('AI分析中...');
        setLogs(['正在调用后端AI分析...']);
        try {
          const aiRes = await apiFetch(`${API_BASE}/api/tools/oa-approval/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: oaContent, attachments: oaAttachment }),
          });
          const aiData = await aiRes.json();
          if (!aiData || !aiData.success) {
            throw new Error(aiData?.message || aiData?.error || `API ${aiRes.status}`);
          }

          setLogs(prev => [...prev, 'AI生成完成']);
          setResultType('success');
          setRunMsg('生成完成');
          setOaResult(aiData);
          fetchCallCount();
        } catch (e) {
          setResultType('error');
          setRunMsg('分析失败');
          setOaResult({ success: false, error: 'AI分析失败', message: String(e) });
          setLogs(prev => [...prev, `错误: ${e}`]);
        }
        setRunning(false);
        return;
      }
      const body = (isSubsidy || isFreeze || isGrossProfit || isAdjust) ? JSON.stringify({ startDate, endDate })
        : undefined;
      const res = await apiFetch(`${API_BASE}/api/tools/${tool.id}/run`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });
      const data = await res.json();
      if (data.success) {
        // 不设置 resultType —— 任务刚启动，等状态轮询确认完成后再设
        setResultType(null);
        // 更新本地运行次数
        if (data.callCount) {
          setCallCount(data.callCount);
        }
        setRunMsg('运行中...');
        addToast({
          type: 'success',
          title: `${tool.name}`,
          message: data.message || '已启动',
          duration: 4000,
        });
        startStatusPolling();
      } else {
        setResultType('error');
        setRunMsg(data.error || '启动失败');
        setRunning(false);
        addToast({
          type: 'error',
          title: `${tool.name}`,
          message: data.error || '启动失败',
          duration: 5000,
        });
      }
    } catch {
      setResultType('error');
      setRunMsg('后端未连接');
      setRunning(false);
      addToast({
        type: 'error',
        title: `${tool.name}`,
        message: '后端未连接，请检查服务状态',
        duration: 6000,
      });
    }
  };

  if (!tool) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center">
          <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-text-muted text-lg">工具未找到</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors duration-300"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors duration-300 mb-8 group"
      >
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        返回首页
      </Link>

      <div className={`rounded-2xl p-6 sm:p-8 mb-8 border border-white/[0.04] relative overflow-hidden ${gradientMap[tool.gradient] || ''}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(255,255,255,0.04),transparent_50%)] pointer-events-none" />
        <div className="relative">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-4xl flex-shrink-0">
              {tool.icon}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 tracking-tight">
                {tool.name}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border ${tagColorMap[tool.tag] || 'bg-white/[0.03] text-text-secondary border-white/[0.05]'}`}
                >
                  {tool.tag}
                </span>
                <span className="text-xs text-text-muted">{tool.category}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={running || (isOA && !oaContent.trim())}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 ${
                running
                  ? 'bg-accent-green/20 text-accent-green border border-accent-green/30 cursor-wait'
                  : resultType === 'success'
                    ? 'bg-accent-green/20 text-accent-green border border-accent-green/30 shadow-lg shadow-accent-green/10'
                    : resultType === 'error'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-lg shadow-red-500/10'
                      : `${runBtnColorMap[tool.gradient] || ''} hover:scale-105 active:scale-95`
              }`}
            >
              {running && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" className="opacity-25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              {resultType === 'success' && !running && (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {resultType === 'error' && !running && (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {running ? (runMsg || '运行中...') : runMsg || '▶ 运行工具'}
            </button>
            <StatusBadge status={tool.status} size="md" />
          </div>
        </div>

        <p className="text-text-secondary/80 leading-relaxed">{tool.fullDescription}</p>

        {/* OA审批：粘贴内容 */}
        {isOA && (
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-sm text-text-muted mb-3 font-medium">📄 粘贴OA页面内容</p>
              <textarea
                value={oaContent}
                onChange={(e) => setOaContent(e.target.value)}
                placeholder="复制OA审批页面的正文内容粘贴到这里..."
                disabled={running}
                rows={6}
                className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-white/[0.08] text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-accent-green/50 transition-colors resize-y"
              />
            </div>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-text-muted font-medium">📎 附件内容（上传Excel或粘贴文本）</p>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={running}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/20 hover:bg-accent-green/20 transition-all duration-300"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    上传Excel
                  </button>
                  {oaFileName && (
                    <span className="text-xs text-accent-green truncate max-w-[150px]">{oaFileName}</span>
                  )}
                </div>
              </div>
              <textarea
                value={oaAttachment}
                onChange={(e) => setOaAttachment(e.target.value)}
                placeholder="上传Excel自动解析，或手动粘贴附件内容..."
                disabled={running}
                rows={5}
                className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-white/[0.08] text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-accent-green/50 transition-colors resize-y"
              />
            </div>
          </div>
        )}

        {/* 日期范围选择 - 补贴跟进和客户费用工具专用 */}
        {(isSubsidy || isFreeze || isGrossProfit || isAdjust) && (
          <div className="mt-5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <p className="text-sm text-text-muted mb-3 font-medium">选择日期范围</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">开始日期</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                  className="px-3 py-2 rounded-lg bg-black/30 border border-white/[0.08] text-sm text-text-primary focus:outline-none focus:border-accent-purple/50 transition-colors cursor-pointer [color-scheme:dark]"
                />
              </div>
              <span className="text-text-muted text-sm">至</span>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">结束日期</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  max={defaultEnd}
                  className="px-3 py-2 rounded-lg bg-black/30 border border-white/[0.08] text-sm text-text-primary focus:outline-none focus:border-accent-purple/50 transition-colors cursor-pointer [color-scheme:dark]"
                />
              </div>
            </div>
          </div>
        )}

        {running && logs.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              <span className="text-sm text-text-muted font-medium">实时日志</span>
              <span className="text-xs text-text-muted/50 ml-auto">{logs.length} 条</span>
            </div>
            <div
              ref={logContainerRef}
              className="max-h-64 overflow-y-auto rounded-xl bg-black/30 border border-white/[0.06] p-4 font-mono text-xs leading-relaxed"
            >
              {logs.map((line, i) => (
                <div key={i} className="py-1 text-accent-green/80">
                  <span className="text-text-muted/40 mr-2">{i + 1}</span>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OA审批结果展示 */}
        {isOA && oaResult && (
          <div className="mt-6 animate-fade-in">
            {oaResult.success ? (
              <div className="space-y-4">
                {/* 提取摘要 */}
                {oaResult.summary && Object.keys(oaResult.summary).length > 0 && (
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-accent-blue/15">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm">📋</span>
                      <span className="text-sm text-text-muted font-medium">提取信息摘要</span>
                      {oaResult.oa_type && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                          {oaResult.oa_type}
                        </span>
                      )}
                      {oaResult.learned && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-accent-green/10 text-accent-green border border-accent-green/20">
                          ✅ 已学习新类型
                        </span>
                      )}
                      {!oaResult.matched && !oaResult.learned && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20">
                          ⚠️ 新OA类型，请仔细复核
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(oaResult.summary).map(([key, value]) => {
                        const displayVal = Array.isArray(value) ? value.join('；') : String(value);
                        return (
                          <div key={key} className="flex items-start gap-2 p-2 rounded-lg bg-black/20">
                            <span className="text-[11px] text-text-muted whitespace-nowrap font-medium">{key}：</span>
                            <span className="text-[11px] text-text-secondary">{displayVal}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 审批意见 */}
                {oaResult.opinion && (
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-accent-green/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">📝</span>
                        <span className="text-sm text-text-muted font-medium">审批意见</span>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          try {
                            await navigator.clipboard.writeText(oaResult.opinion || '');
                            addToast({ type: 'success', title: '已复制', message: '审批意见已复制到剪贴板', duration: 3000 });
                          } catch {
                            addToast({ type: 'error', title: '复制失败', message: '请手动选中文本复制', duration: 3000 });
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/20 hover:bg-accent-green/20 hover:border-accent-green/30 transition-all duration-300"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        一键复制
                      </button>
                    </div>
                    <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans leading-relaxed bg-black/30 rounded-lg p-4 border border-white/[0.04]">
                      {oaResult.opinion}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/15">
                <div className="flex items-center gap-2">
                  <span className="text-lg">❌</span>
                  <div>
                    <p className="text-sm font-medium text-red-400">{oaResult.error || '生成失败'}</p>
                    {oaResult.message && (
                      <p className="text-xs text-text-muted mt-1">{oaResult.message}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <div className="glass-card p-5 group hover:border-accent-blue/20 transition-all duration-500">
          <p className="text-xs text-text-muted mb-2">响应时间</p>
          <p className={`text-2xl font-bold tracking-tight ${statColorMap[tool.gradient] || ''}`}>{tool.responseTime}<span className="text-sm font-normal text-text-muted ml-1">分钟</span></p>
        </div>
        <div className="glass-card p-5 group hover:border-accent-cyan/20 transition-all duration-500">
          <p className="text-xs text-text-muted mb-2">版本号</p>
          <p className="text-2xl font-bold text-text-primary tracking-tight">{tool.version}</p>
        </div>
        <div className="glass-card p-5 group hover:border-accent-purple/20 transition-all duration-500">
          <p className="text-xs text-text-muted mb-2">累计调用</p>
          <p className="text-2xl font-bold text-text-primary tracking-tight">{callCount}<span className="text-sm font-normal text-text-muted ml-1">次</span></p>
        </div>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-5">核心功能</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tool.features.map((feature, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.04] hover:border-white/[0.06] transition-all duration-300"
            >
              <span className={`flex-shrink-0 w-6 h-6 rounded-lg ${featureIconBgMap[tool.gradient] || 'bg-accent-blue/10'} flex items-center justify-center mt-px`}>
                <svg className={`w-3.5 h-3.5 ${featureIconColorMap[tool.gradient] || 'text-accent-blue'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-sm text-text-secondary">{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
