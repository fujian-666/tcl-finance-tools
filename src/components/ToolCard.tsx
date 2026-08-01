import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tool } from '../data/tools';
import StatusBadge from './StatusBadge';
import { useToast } from '../contexts/ToastContext';

import { apiFetch } from '../lib/api';

const API_BASE = '';

interface ToolCardProps {
  tool: Tool;
  index: number;
}

interface MonitorData {
  balance: string | null;
  consumption: string | null;
  lastCheck: string | null;
  status: string;
}

const gradientMap: Record<string, string> = {
  blue: 'gradient-card-blue',
  cyan: 'gradient-card-cyan',
  purple: 'gradient-card-purple',
  orange: 'gradient-card-orange',
  green: 'gradient-card-green',
};

const glowMap: Record<string, string> = {
  blue: 'hover:shadow-[0_0_40px_-10px_rgba(59,130,246,0.25)]',
  cyan: 'hover:shadow-[0_0_40px_-10px_rgba(6,182,212,0.25)]',
  purple: 'hover:shadow-[0_0_40px_-10px_rgba(139,92,246,0.25)]',
  orange: 'hover:shadow-[0_0_40px_-10px_rgba(249,115,22,0.25)]',
  green: 'hover:shadow-[0_0_40px_-10px_rgba(16,185,129,0.25)]',
};

const gradientIconBgMap: Record<string, string> = {
  blue: 'bg-accent-blue/10 group-hover:bg-accent-blue/20',
  cyan: 'bg-accent-cyan/10 group-hover:bg-accent-cyan/20',
  purple: 'bg-accent-purple/10 group-hover:bg-accent-purple/20',
  orange: 'bg-orange-500/10 group-hover:bg-orange-500/20',
  green: 'bg-accent-green/10 group-hover:bg-accent-green/20',
};

const gradientIconBorderMap: Record<string, string> = {
  blue: 'border-accent-blue/20 group-hover:border-accent-blue/35',
  cyan: 'border-accent-cyan/20 group-hover:border-accent-cyan/35',
  purple: 'border-accent-purple/20 group-hover:border-accent-purple/35',
  orange: 'border-orange-500/20 group-hover:border-orange-500/35',
  green: 'border-accent-green/20 group-hover:border-accent-green/35',
};

const gradientBtnColorMap: Record<string, string> = {
  blue: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20 hover:bg-accent-blue/20 hover:shadow-[0_0_15px_-3px_rgba(59,130,246,0.3)]',
  cyan: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20 hover:bg-accent-cyan/20 hover:shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)]',
  purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20 hover:bg-accent-purple/20 hover:shadow-[0_0_15px_-3px_rgba(139,92,246,0.3)]',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20 hover:shadow-[0_0_15px_-3px_rgba(249,115,22,0.3)]',
  green: 'bg-accent-green/10 text-accent-green border-accent-green/20 hover:bg-accent-green/20 hover:shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]',
};

const tagColorMap: Record<string, string> = {
  Finance: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  Check: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
  AI: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
  Reminder: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  OA: 'bg-accent-green/10 text-accent-green border-accent-green/20',
};

// 默认日期范围：本月（本地时区）
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const defaultEndDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const defaultStartDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
const defaultYearStartDate = `${now.getFullYear()}-01-01`;

export default function ToolCard({ tool, index }: ToolCardProps) {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [monitor, setMonitor] = useState<MonitorData>({ balance: null, consumption: null, lastCheck: null, status: 'idle' });
  const [ocrUrl, setOcrUrl] = useState<string | null>(null);
  const [resultType, setResultType] = useState<'success' | 'error' | null>(null);
  const [callCount, setCallCount] = useState(tool.callCount);
  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearResultRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  const isMonitor = tool.id === 'deepseek-monitor';
  const isInvoiceOcr = tool.id === 'invoice-ocr';
  const isSubsidy = tool.id === 'subsidy-tracking';
  const isFreeze = tool.id === 'settlement-freeze';
  const isGrossProfit = tool.id === 'settlement-gross-profit';
  const isAdjust = tool.id === 'settlement-adjust';
  const isCashApp = tool.id === 'cash-application-query';
  const [subStartDate, setSubStartDate] = useState(defaultStartDate);
  const [subEndDate, setSubEndDate] = useState(defaultEndDate);
  const [freezeStartDate, setFreezeStartDate] = useState(defaultStartDate);
  const [freezeEndDate, setFreezeEndDate] = useState(defaultEndDate);
  const [grossProfitStartDate, setGrossProfitStartDate] = useState(defaultStartDate);
  const [grossProfitEndDate, setGrossProfitEndDate] = useState(defaultEndDate);
  const [adjustStartDate, setAdjustStartDate] = useState(defaultStartDate);
  const [adjustEndDate, setAdjustEndDate] = useState(defaultEndDate);
  const [cashStartDate, setCashStartDate] = useState(defaultYearStartDate);
  const [cashEndDate, setCashEndDate] = useState(defaultEndDate);

  // 检查工具初始状态
  useEffect(() => {
    checkInitialStatus();
    fetchCallCount();
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (logRef.current) {
        clearInterval(logRef.current);
        logRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (clearResultRef.current) {
        clearTimeout(clearResultRef.current);
        clearResultRef.current = null;
      }
    };
  }, []);

  const fetchCallCount = async () => {
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

  const checkInitialStatus = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/tools/${tool.id}/status`);
      const data = await res.json();
      if (data.running && mountedRef.current) {
        setRunning(true);
        setMessage(data.message || '运行中...');
        startStatusPolling();
      } else if (data.exitCode !== undefined && mountedRef.current) {
        // 有完成记录，显示结果
        if (data.exitCode === 0) {
          setResultType('success');
          setMessage(data.message || '已完成');
        } else {
          setResultType('error');
          setMessage(data.message || '失败');
        }
        setRunning(false);
        setTimeout(() => {
          if (mountedRef.current) { setResultType(null); setMessage(''); }
        }, 5000);
      } else if (mountedRef.current) {
        // 后端无运行中进程也无历史记录 → 确保前端显示 idle
        setRunning(false);
        setResultType(null);
        setMessage('');
      }
    } catch {
      // 后端不可用 → 也重置为 idle，避免永远显示"运行中"
      if (mountedRef.current) {
        setRunning(false);
        setResultType(null);
        setMessage('');
      }
    }
  };

  const startStatusPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (logRef.current) clearInterval(logRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // 5分钟超时 — 防止 close 事件不触发导致状态卡死
    timeoutRef.current = setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (logRef.current) {
        clearInterval(logRef.current);
        logRef.current = null;
      }
      if (mountedRef.current) {
        setRunning(false);
        setResultType('error');
        setMessage('运行超时，但可能已完成（请检查飞书）');
        setTimeout(() => {
          if (mountedRef.current) { setResultType(null); setMessage(''); setLogs([]); }
        }, 8000);
      }
    }, 5 * 60 * 1000);

    // 状态轮询（带重试计数和错误处理，一劳永逸）
    let pollFailCount = 0;
    const MAX_POLL_FAILS = 5;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/api/tools/${tool.id}/status?_t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        pollFailCount = 0;
        if (!mountedRef.current) return;
        if (!data.running) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          clearInterval(logRef.current!);
          logRef.current = null;
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
          setRunning(false);
          if (data.exitCode === 0) {
            setResultType('success');
            setMessage(data.message || '运行完成');
            addToast({ type: 'success', title: tool.name, message: '运行完成，已导出并发送飞书', duration: 6000 });
          } else if (data.exitCode !== undefined) {
            setResultType('error');
            setMessage(data.message || '运行失败');
            addToast({ type: 'error', title: tool.name, message: data.message || '运行失败，请查看日志', duration: 8000 });
          } else {
            // 进程已退出但无 exitCode（可能已完成超过5分钟），视为成功
            setResultType('success');
            setMessage('已完成（请检查飞书）');
            addToast({ type: 'success', title: tool.name, message: '任务已完成，请检查飞书通知', duration: 6000 });
          }
          fetchCallCount();
          if (clearResultRef.current) clearTimeout(clearResultRef.current);
          clearResultRef.current = setTimeout(() => {
            if (mountedRef.current) { setResultType(null); setMessage(''); setLogs([]); }
          }, 30000);
        } else {
          setMessage(data.message || '运行中...');
        }
      } catch (e) {
        pollFailCount++;
        console.error(`[StatusPoll] Fetch error (${pollFailCount}/${MAX_POLL_FAILS}):`, e);
        if (pollFailCount >= MAX_POLL_FAILS) {
          // 连续失败太多次，停止轮询并提示用户
          clearInterval(pollRef.current!);
          pollRef.current = null;
          clearInterval(logRef.current!);
          logRef.current = null;
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
          if (mountedRef.current) {
            setRunning(false);
            setResultType('error');
            setMessage('后端连接失败，请刷新页面重试');
            addToast({ type: 'error', title: tool.name, message: '后端连接失败，请刷新页面后重试', duration: 8000 });
          }
        }
      }
    }, 2000);

    // 日志轮询
    logRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/api/tools/${tool.id}/logs`);
        const data = await res.json();
        if (!mountedRef.current) return;
        if (data.logs && data.logs.length > 0) {
          setLogs(data.logs);
          // 自动滚动到底部
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        }
      } catch (e) {
        console.error('[LogPoll] Fetch error:', e);
      }
    }, 1000);
  };

  const fetchMonitorData = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/tools/deepseek-monitor/data`);
      const data = await res.json();
      if (mountedRef.current) setMonitor(data);
    } catch {
      // backend not available
    }
  }, []);

  useEffect(() => {
    if (isMonitor) {
      fetchMonitorData();
      const interval = setInterval(fetchMonitorData, 5000);
      return () => clearInterval(interval);
    }
  }, [isMonitor]);

  useEffect(() => {
    if (isInvoiceOcr) {
      apiFetch(`${API_BASE}/api/tools/invoice-ocr/status`)
        .then(r => r.json())
        .then(data => { if (data.running) setOcrUrl(data.url); })
        .catch(() => {});
    }
  }, [isInvoiceOcr]);

  const isOA = tool.id === 'oa-approval';

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (running) return;

    // OA审批助手：跳转到详情页输入URL
    if (isOA) {
      navigate(`/tool/${tool.id}`);
      return;
    }

    setRunning(true);
    setMessage('启动中...');
    setResultType(null);
    setLogs([]);

    try {
      const body = isSubsidy ? JSON.stringify({ startDate: subStartDate, endDate: subEndDate })
        : isFreeze ? JSON.stringify({ startDate: freezeStartDate, endDate: freezeEndDate })
        : isGrossProfit ? JSON.stringify({ startDate: grossProfitStartDate, endDate: grossProfitEndDate })
        : isAdjust ? JSON.stringify({ startDate: adjustStartDate, endDate: adjustEndDate })
        : isCashApp ? JSON.stringify({ startDate: cashStartDate, endDate: cashEndDate })
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
        addToast({
          type: 'success',
          title: `${tool.name}`,
          message: data.message || '已启动',
          duration: 4000,
        });

        if (isMonitor) {
          setMessage('监控中...');
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            try {
              const mr = await apiFetch(`${API_BASE}/api/tools/deepseek-monitor/data`);
              const md = await mr.json();
              if (mountedRef.current) setMonitor(md);
              if (md.balance || md.consumption || attempts > 12) {
                clearInterval(poll);
                if (mountedRef.current) { setRunning(false); setMessage(''); }
              }
            } catch {
              if (attempts > 12) {
                clearInterval(poll);
                if (mountedRef.current) { setRunning(false); setMessage(''); }
              }
            }
          }, 5000);
          pollRef.current = poll;
        } else if (isInvoiceOcr) {
          if (data.url) {
            setOcrUrl(data.url);
            setMessage('已启动');
            setTimeout(() => { if (mountedRef.current) { setRunning(false); setMessage(''); setResultType(null); } }, 3000);
          } else {
            setMessage('已启动');
            setTimeout(() => { if (mountedRef.current) { setRunning(false); setMessage(''); setResultType(null); } }, 3000);
          }
        } else {
          setMessage('运行中...');
          startStatusPolling();
        }
      } else {
        setResultType('error');
        addToast({
          type: 'error',
          title: `${tool.name}`,
          message: data.error || '启动失败',
          duration: 5000,
        });
        if (mountedRef.current) { setMessage(data.error || '启动失败'); setRunning(false); }
      }
    } catch {
      setResultType('error');
      addToast({
        type: 'error',
        title: `${tool.name}`,
        message: '后端未连接，请检查服务状态',
        duration: 6000,
      });
      if (mountedRef.current) { setMessage('后端未连接'); setRunning(false); }
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '--';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const navigatePath = isSubsidy
    ? `/tool/${tool.id}?startDate=${subStartDate}&endDate=${subEndDate}`
    : isFreeze
      ? `/tool/${tool.id}?startDate=${freezeStartDate}&endDate=${freezeEndDate}`
      : isGrossProfit
        ? `/tool/${tool.id}?startDate=${grossProfitStartDate}&endDate=${grossProfitEndDate}`
        : isAdjust
          ? `/tool/${tool.id}?startDate=${adjustStartDate}&endDate=${adjustEndDate}`
          : isCashApp
            ? `/tool/${tool.id}?startDate=${cashStartDate}&endDate=${cashEndDate}`
            : `/tool/${tool.id}`;

  return (
    <div
      onClick={() => navigate(navigatePath)}
      className={`group cursor-pointer rounded-2xl p-5 transition-all duration-500 hover:scale-[1.01] hover:-translate-y-1 animate-fade-in relative overflow-hidden ${
        resultType === 'success'
          ? 'border border-accent-green/50 shadow-[0_0_25px_-5px_rgba(16,185,129,0.3)] animate-result-flash-success'
          : resultType === 'error'
            ? 'border border-red-500/40 shadow-[0_0_25px_-5px_rgba(239,68,68,0.3)] animate-result-flash-error'
            : `border border-white/[0.04] ${gradientMap[tool.gradient] || ''} ${glowMap[tool.gradient] || ''}`
      }`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(255,255,255,0.03),transparent_60%)] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      {/* 头部：图标 + 名称 + 标签 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`relative w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-xl group-hover:scale-110 transition-transform duration-500 overflow-hidden ${gradientIconBgMap[tool.gradient] || ''} ${gradientIconBorderMap[tool.gradient] || ''}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <span className="relative">{tool.icon}</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary group-hover:text-white transition-colors leading-tight max-w-[200px] truncate">
              {tool.name}
            </h3>
            <span
              className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${tagColorMap[tool.tag] || 'bg-white/[0.03] text-text-secondary border-white/[0.05]'}`}
            >
              {tool.tag}
            </span>
          </div>
        </div>
        <StatusBadge status={tool.status} />
      </div>

      {/* 描述 */}
      <p className="text-xs text-text-secondary/70 leading-relaxed mb-3 line-clamp-2">
        {tool.description}
      </p>

      {running && logs.length > 0 && (
        <div className="mb-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <span className="text-[11px] text-text-muted font-medium">实时日志</span>
          </div>
          <div
            ref={logContainerRef}
            className="max-h-32 overflow-y-auto rounded-lg bg-black/30 border border-white/[0.06] p-2 font-mono text-[10px] leading-relaxed text-text-muted"
          >
            {logs.map((line, i) => (
              <div key={i} className="py-0.5 text-accent-green/80">
                <span className="text-text-muted/50 mr-1">{i + 1}</span>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {isMonitor && (monitor.balance || monitor.consumption || monitor.lastCheck) && (
        <div className="mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/3 via-accent-cyan/3 to-accent-purple/3" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${monitor.status === 'running' ? 'bg-accent-green animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-accent-blue shadow-[0_0_6px_rgba(59,130,246,0.5)]'}`} />
              <span className="text-[11px] text-text-muted font-medium">实时监控数据</span>
              {monitor.lastCheck && (
                <span className="text-[10px] text-text-muted/50 ml-auto">{formatTime(monitor.lastCheck)}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <p className="text-[10px] text-text-muted/50 mb-1">充值余额</p>
                <p className="text-lg font-bold text-accent-green drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                  {monitor.balance ? `¥${monitor.balance}` : '--'}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <p className="text-[10px] text-text-muted/50 mb-1">本月消费</p>
                <p className="text-lg font-bold text-accent-cyan drop-shadow-[0_0_8px_rgba(6,182,212,0.3)]">
                  {monitor.consumption ? `¥${monitor.consumption}` : '--'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInvoiceOcr && ocrUrl && (
        <div className="mb-5 animate-fade-in">
          <a
            href={ocrUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-accent-blue/10 to-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan text-sm font-medium hover:from-accent-blue/20 hover:to-accent-cyan/20 hover:border-accent-cyan/40 hover:shadow-[0_0_20px_-5px_rgba(6,182,212,0.2)] transition-all duration-300"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            打开发票识别工具
          </a>
        </div>
      )}

      {isSubsidy && (
        <div className="mb-5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-[10px] text-text-muted mb-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            日期范围
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={subStartDate}
              onChange={(e) => setSubStartDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-purple/40 transition-colors duration-300 [color-scheme:dark]"
            />
            <span className="text-[10px] text-text-muted">~</span>
            <input
              type="date"
              value={subEndDate}
              onChange={(e) => setSubEndDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-purple/40 transition-colors duration-300 [color-scheme:dark]"
            />
          </div>
        </div>
      )}
      {isFreeze && (
        <div className="mb-5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-[10px] text-text-muted mb-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            日期范围（大区=华南大区, 战区=全选, 渠道=连锁, 产品线=全选）
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={freezeStartDate}
              onChange={(e) => setFreezeStartDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-blue/40 transition-colors duration-300 [color-scheme:dark]"
            />
            <span className="text-[10px] text-text-muted">~</span>
            <input
              type="date"
              value={freezeEndDate}
              onChange={(e) => setFreezeEndDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-blue/40 transition-colors duration-300 [color-scheme:dark]"
            />
          </div>
        </div>
      )}

      {isGrossProfit && (
        <div className="mb-5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-[10px] text-text-muted mb-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            日期范围（法人=宁波智能, 产品线=全选, 大区=华南, 战区=全选）
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={grossProfitStartDate}
              onChange={(e) => setGrossProfitStartDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-green/40 transition-colors duration-300 [color-scheme:dark]"
            />
            <span className="text-[10px] text-text-muted">~</span>
            <input
              type="date"
              value={grossProfitEndDate}
              onChange={(e) => setGrossProfitEndDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-green/40 transition-colors duration-300 [color-scheme:dark]"
            />
          </div>
        </div>
      )}
      {isAdjust && (
        <div className="mb-5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-[10px] text-text-muted mb-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            日期范围（产品线=全选, 营销组织=华南大区, 还原项目=全选）
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={adjustStartDate}
              onChange={(e) => setAdjustStartDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-purple/40 transition-colors duration-300 [color-scheme:dark]"
            />
            <span className="text-[10px] text-text-muted">~</span>
            <input
              type="date"
              value={adjustEndDate}
              onChange={(e) => setAdjustEndDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-purple/40 transition-colors duration-300 [color-scheme:dark]"
            />
          </div>
        </div>
      )}

      {isCashApp && (
        <div className="mb-5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-[10px] text-text-muted mb-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            时间范围（法人=宁波智能 | 审批中 | 空调 | 华南大区）
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={cashStartDate}
              onChange={(e) => setCashStartDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-green/40 transition-colors duration-300 [color-scheme:dark]"
            />
            <span className="text-[10px] text-text-muted">~</span>
            <input
              type="date"
              value={cashEndDate}
              onChange={(e) => setCashEndDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.08] text-text-primary focus:outline-none focus:border-accent-green/40 transition-colors duration-300 [color-scheme:dark]"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3.5 border-t border-white/[0.04]">
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {tool.responseTime}ms
          </span>
          <span className="text-text-muted/40">{tool.version}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1 text-[11px] text-text-muted">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="font-medium text-text-secondary">{callCount}次</span>
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className={`relative px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-300 overflow-hidden ${
              running
                ? 'bg-accent-green/15 text-accent-green border border-accent-green/25 cursor-wait'
                : resultType === 'success'
                  ? 'bg-accent-green/15 text-accent-green border border-accent-green/25'
                  : resultType === 'error'
                    ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                    : `${gradientBtnColorMap[tool.gradient] || ''} hover:scale-105 active:scale-95`
            }`}
          >
            {running && (
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-shimmer" />
            )}
            <span className="relative flex items-center gap-1">
              {running ? (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" className="opacity-25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : resultType === 'success' ? (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : resultType === 'error' ? (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : null}
              {resultType === 'success' ? (message || '已完成') : resultType === 'error' ? (message || '失败') : running ? (message || '运行中...') : '▶ 运行'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}