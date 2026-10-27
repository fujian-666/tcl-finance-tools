import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function CasualInventory() {
  const [stats, setStats] = useState<{ casual_records: number } | null>(null);
  const [exportFormat, setExportFormat] = useState('csv');
  const [store, setStore] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/inventory/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch {
      // 服务未启动
    }
  }, []);

  useEffect(() => {
    // 延迟到 effect 提交后异步执行，避免在 effect 体内同步 setState
    const timer = setTimeout(loadStats, 0);
    return () => clearTimeout(timer);
  }, [loadStats]);

  const handleExport = async () => {
    let url = `/api/casual/export?format=${exportFormat}`;
    if (store && store.trim()) {
      url += `&store=${encodeURIComponent(store.trim())}`;
    }

    setExporting(true);
    try {
      const res = await apiFetch(url);

      if (!res.ok) {
        let msg = '导出失败';
        try {
          const data = await res.json();
          msg = data.message || msg;
        } catch {
          const text = await res.text();
          if (text) msg = text.substring(0, 100);
        }
        alert(msg);
        return;
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `export.${exportFormat}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*=(?:UTF-8''|utf-8'')(.+)/i)
                   || contentDisposition.match(/filename=(.+)/);
        if (match) {
          filename = decodeURIComponent(match[1].replace(/"/g, '').trim());
        }
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      alert('导出成功！文件已下载。');
    } catch (err) {
      alert('导出失败：' + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors duration-300 mb-8 group"
      >
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        返回首页
      </Link>

      <div className="rounded-2xl p-6 sm:p-8 mb-8 border border-white/[0.04] bg-gradient-to-br from-purple-500/5 via-transparent to-purple-500/5">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-4xl flex-shrink-0">
            🎯
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 tracking-tight">
              华南大区随手盘数据管理后台
            </h1>
            <p className="text-text-secondary/80">随手盘盘点系统数据管理工具（与样机盘点两套独立系统）</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-5 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-purple/20 flex items-center justify-center">🎯</div>
          <div>
            <p className="text-xs text-text-muted">随手盘盘点记录</p>
            <p className="text-xl font-bold text-accent-purple">{stats?.casual_records ?? '--'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="glass-card p-6 border-l-4 border-accent-purple">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-accent-purple/20 flex items-center justify-center text-xl">🎯</div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">随手盘数据导出</h2>
              <p className="text-xs text-text-muted">导出随手盘盘点数据（Excel / PDF 格式与样机盘点完全一致）</p>
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-sm text-text-muted mb-2">选择导出格式</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setExportFormat('csv')}
                className={`p-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                  exportFormat === 'csv'
                    ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30'
                    : 'bg-white/[0.02] text-text-secondary border-white/[0.04] hover:bg-white/[0.04]'
                }`}
              >
                📊 CSV
              </button>
              <button
                onClick={() => setExportFormat('xlsx')}
                className={`p-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                  exportFormat === 'xlsx'
                    ? 'bg-accent-green/20 text-accent-green border-accent-green/30'
                    : 'bg-white/[0.02] text-text-secondary border-white/[0.04] hover:bg-white/[0.04]'
                }`}
              >
                📗 Excel
              </button>
              <button
                onClick={() => setExportFormat('pdf')}
                className={`p-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                  exportFormat === 'pdf'
                    ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                    : 'bg-white/[0.02] text-text-secondary border-white/[0.04] hover:bg-white/[0.04]'
                }`}
              >
                📕 PDF
              </button>
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-sm text-text-muted mb-2">按门店筛选（可选）</label>
            <input
              type="text"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="输入门店名称，如：XXX门店"
              className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-accent-purple/50 transition-colors"
            />
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full py-3 rounded-xl bg-accent-purple/20 text-accent-purple border border-accent-purple/30 font-semibold hover:bg-accent-purple/30 hover:shadow-lg hover:shadow-accent-purple/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {exporting ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" className="opacity-25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                导出中...
              </>
            ) : (
              '📥 导出随手盘数据'
            )}
          </button>
        </div>

        <div className="glass-card p-4">
          <p className="text-sm text-text-muted font-medium mb-2">💡 导出说明</p>
          <ul className="text-xs text-text-muted/70 space-y-1">
            <li>• 随手盘与样机盘点两套独立系统，数据分开导出</li>
            <li>• CSV格式：通用格式，可用Excel/WPS打开</li>
            <li>• Excel格式：xlsx格式，列结构与样机盘点完全一致</li>
            <li>• PDF格式：样机盘点报告，含电子签名，格式与样机盘点报告一致</li>
            <li>• 支持按门店名称筛选导出特定门店数据</li>
            <li>• 随手盘数据仅支持导出，请勿在小程序端清空，统一在此管理</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
