import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

// ??????????? Vite ??? 3004????? /api
const INVENTORY_API_BASE = '';

export default function AssetInventory() {
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'photos'>('import');
  const [stats, setStats] = useState<{ fixed_asset_records: number; inventory_records: number } | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  
  const [fixedAssetFile, setFixedAssetFile] = useState<File | null>(null);
  const [fixedAssetUploading, setFixedAssetUploading] = useState(false);
  const [fixedAssetResult, setFixedAssetResult] = useState<{ success: boolean; message: string; successCount?: number; failCount?: number; totalCount?: number; preview?: any[] } | null>(null);
  
  const [inventoryFile, setInventoryFile] = useState<File | null>(null);
  const [inventoryUploading, setInventoryUploading] = useState(false);
  const [inventoryResult, setInventoryResult] = useState<{ success: boolean; message: string; successCount?: number; failCount?: number; totalCount?: number; preview?: any[] } | null>(null);
  
  const [fixedAssetZone, setFixedAssetZone] = useState('');
  const [fixedAssetExportFormat, setFixedAssetExportFormat] = useState('csv');
  const [inventoryExportFormat, setInventoryExportFormat] = useState('csv');
  const [storeList, setStoreList] = useState<string[]>([]);
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  const fixedAssetFileInputRef = useRef<HTMLInputElement>(null);
  const inventoryFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await apiFetch(`${INVENTORY_API_BASE}/api/inventory/stats`);
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch {
      // 服务未启动
    }
  };

  const handleUpload = async (collectionName: string, file: File | null, setUploading: (val: boolean) => void, setResult: (val: any) => void, setFile: (val: File | null) => void) => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('collection', collectionName);

    try {
      const res = await apiFetch(`${INVENTORY_API_BASE}/api/inventory/import`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setResult(data);
      loadStats();
    } catch (err) {
      setResult({ success: false, message: '导入失败：' + (err as Error).message });
    } finally {
      setUploading(false);
      setFile(null);
    }
  };

  const handleExport = async (collectionName: string, format: string, zone: string) => {
    let url = `${INVENTORY_API_BASE}/api/inventory/export?collection=${collectionName}&format=${format}`;
    if (zone && zone.trim()) {
      url += `&zone=${encodeURIComponent(zone.trim())}`;
    }

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
      let filename = `export.${format}`;
      if (contentDisposition) {
        // 优先匹配 filename*=UTF-8'' 格式（RFC 5987），再匹配普通 filename=
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
    }
  };

  const loadStores = async () => {
    try {
      const res = await apiFetch(`${INVENTORY_API_BASE}/api/inventory/export?collection=inventory_records&format=csv`);
      const text = await res.text();
      const lines = text.split('\n').slice(1).filter(l => l.trim());
      const stores = [...new Set(lines.map(l => l.split(',')[3]?.replace(/"/g, '') || '').filter(Boolean))].sort();
      setStoreList(stores);
      setShowStorePicker(true);
    } catch { alert('加载门店列表失败'); }
  };

  const toggleStore = (s: string) => {
    const next = new Set(selectedStores);
    next.has(s) ? next.delete(s) : next.add(s);
    setSelectedStores(next);
  };

  const selectAllStores = () => {
    if (selectedStores.size === storeList.length) setSelectedStores(new Set());
    else setSelectedStores(new Set(storeList));
  };

  const batchExport = async () => {
    if (selectedStores.size === 0) { alert('请先选择门店'); return; }
    setExporting(true);
    const stores = [...selectedStores];
    for (let i = 0; i < stores.length; i++) {
      const store = stores[i];
      const url = `${INVENTORY_API_BASE}/api/inventory/export?collection=inventory_records&format=${inventoryExportFormat}&store=${encodeURIComponent(store)}`;
      try {
        const res = await apiFetch(url);
        if (!res.ok) { alert(`导出失败: ${store}`); continue; }
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        const m = cd.match(/filename\*=(?:UTF-8''|utf-8'')(.+)/i) || cd.match(/filename=(.+)/);
        const filename = m ? decodeURIComponent(m[1].replace(/"/g, '').trim()) : `${store}.${inventoryExportFormat}`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        if (stores.length > 1) await new Promise(r => setTimeout(r, 500)); // 间隔500ms避免浏览器拦截
      } catch { alert(`导出失败: ${store}`); }
    }
    setExporting(false);
  };

  const loadPhotos = async () => {
    setLoadingPhotos(true);
    try {
      let url = `${INVENTORY_API_BASE}/api/inventory/photos?collection=fixed_asset_records`;
      if (fixedAssetZone.trim()) {
        url += `&zone=${encodeURIComponent(fixedAssetZone.trim())}`;
      }
      const res = await apiFetch(url);
      const data = await res.json();
      if (data.success) {
        setPhotos(data.data);
      }
    } catch (err) {
      alert('获取照片列表失败：' + (err as Error).message);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const downloadPhoto = async (fileID: string) => {
    try {
      const res = await apiFetch(`${INVENTORY_API_BASE}/api/inventory/photo/download?fileID=${encodeURIComponent(fileID)}`);
      if (!res.ok) { alert('?????HTTP ' + res.status); return; }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*=(?:UTF-8''|utf-8'')(.+)/i) || cd.match(/filename=(.+)/);
      const filename = m ? decodeURIComponent(m[1].replace(/"/g, '').trim()) : 'photo.jpg';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('?????' + (err as Error).message);
    }
  };

  const renderResult = (result: any) => {
    if (!result) return null;
    return (
      <div className={`mt-4 p-4 rounded-xl ${result.success ? 'bg-accent-green/10 border border-accent-green/20' : 'bg-red-500/10 border border-red-500/20'}`}>
        <p className={result.success ? 'text-accent-green' : 'text-red-400'}>{result.message}</p>
        {result.success && result.successCount !== undefined && (
          <div className="flex gap-6 mt-3">
            <div>
              <span className="text-xl font-bold text-accent-green">{result.successCount}</span>
              <span className="text-xs text-text-muted ml-1">成功</span>
            </div>
            <div>
              <span className="text-xl font-bold text-red-400">{result.failCount}</span>
              <span className="text-xs text-text-muted ml-1">失败</span>
            </div>
            <div>
              <span className="text-xl font-bold text-text-primary">{result.totalCount}</span>
              <span className="text-xs text-text-muted ml-1">总数</span>
            </div>
          </div>
        )}
      </div>
    );
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

      <div className="rounded-2xl p-6 sm:p-8 mb-8 border border-white/[0.04] bg-gradient-to-br from-orange-500/5 via-transparent to-orange-500/5">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-4xl flex-shrink-0">
            🏢
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 tracking-tight">
              华南大区运营资产盘点数据管理后台
            </h1>
            <p className="text-text-secondary/80">运营资产盘点系统数据管理工具</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setActiveTab('import'); setPhotos([]); }}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
              activeTab === 'import'
                ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                : 'bg-white/[0.02] text-text-secondary border border-white/[0.04] hover:bg-white/[0.04]'
            }`}
          >
            📥 数据导入
          </button>
          <button
            onClick={() => { setActiveTab('export'); setPhotos([]); }}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
              activeTab === 'export'
                ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30'
                : 'bg-white/[0.02] text-text-secondary border border-white/[0.04] hover:bg-white/[0.04]'
            }`}
          >
            📤 数据导出
          </button>
          <button
            onClick={() => { setActiveTab('photos'); loadPhotos(); }}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
              activeTab === 'photos'
                ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                : 'bg-white/[0.02] text-text-secondary border border-white/[0.04] hover:bg-white/[0.04]'
            }`}
          >
            🖼️ 照片管理
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-8">
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-blue/20 flex items-center justify-center">🏢</div>
            <div>
              <p className="text-xs text-text-muted">固定资产记录</p>
              <p className="text-xl font-bold text-accent-blue">{stats?.fixed_asset_records || '--'}</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-cyan/20 flex items-center justify-center">📦</div>
            <div>
              <p className="text-xs text-text-muted">样机盘点记录</p>
              <p className="text-xl font-bold text-accent-cyan">{stats?.inventory_records || '--'}</p>
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'import' && (
        <div className="space-y-6">
          <div className="glass-card p-6 border-l-4 border-accent-blue">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-accent-blue/20 flex items-center justify-center text-xl">🏢</div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">固定资产数据导入</h2>
                <p className="text-xs text-text-muted">导入固定资产盘点数据</p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-text-muted mb-2">选择CSV文件</label>
              <div
                onClick={() => fixedAssetFileInputRef.current?.click()}
                className="border-2 border-dashed border-white/[0.15] rounded-xl p-8 text-center cursor-pointer hover:border-accent-blue/30 hover:bg-accent-blue/[0.02] transition-all duration-300"
              >
                <input
                  ref={fixedAssetFileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      setFixedAssetFile(files[0]);
                      setFixedAssetResult(null);
                    }
                  }}
                  className="hidden"
                />
                <div className="text-4xl mb-3">📁</div>
                <p className="text-text-primary mb-1">
                  {fixedAssetFile ? fixedAssetFile.name : '点击选择文件'}
                </p>
                <p className="text-xs text-text-muted">支持 .csv / .xlsx / .xls 格式</p>
              </div>
            </div>

            <button
              onClick={() => handleUpload('fixed_asset_records', fixedAssetFile, setFixedAssetUploading, setFixedAssetResult, setFixedAssetFile)}
              disabled={!fixedAssetFile || fixedAssetUploading}
              className="w-full py-3 rounded-xl bg-accent-blue/20 text-accent-blue border border-accent-blue/30 font-semibold hover:bg-accent-blue/30 hover:shadow-lg hover:shadow-accent-blue/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {fixedAssetUploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" className="opacity-25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  导入中...
                </>
              ) : (
                '▶ 导入固定资产数据'
              )}
            </button>

            {renderResult(fixedAssetResult)}
          </div>

          <div className="glass-card p-6 border-l-4 border-accent-cyan">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-accent-cyan/20 flex items-center justify-center text-xl">📦</div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">样机盘点数据导入</h2>
                <p className="text-xs text-text-muted">导入样机盘点数据</p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-text-muted mb-2">选择CSV文件</label>
              <div
                onClick={() => inventoryFileInputRef.current?.click()}
                className="border-2 border-dashed border-white/[0.15] rounded-xl p-8 text-center cursor-pointer hover:border-accent-cyan/30 hover:bg-accent-cyan/[0.02] transition-all duration-300"
              >
                <input
                  ref={inventoryFileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      setInventoryFile(files[0]);
                      setInventoryResult(null);
                    }
                  }}
                  className="hidden"
                />
                <div className="text-4xl mb-3">📁</div>
                <p className="text-text-primary mb-1">
                  {inventoryFile ? inventoryFile.name : '点击选择文件'}
                </p>
                <p className="text-xs text-text-muted">支持 .csv / .xlsx / .xls 格式</p>
              </div>
            </div>

            <button
              onClick={() => handleUpload('inventory_records', inventoryFile, setInventoryUploading, setInventoryResult, setInventoryFile)}
              disabled={!inventoryFile || inventoryUploading}
              className="w-full py-3 rounded-xl bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 font-semibold hover:bg-accent-cyan/30 hover:shadow-lg hover:shadow-accent-cyan/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {inventoryUploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" className="opacity-25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  导入中...
                </>
              ) : (
                '▶ 导入样机盘点数据'
              )}
            </button>

            {renderResult(inventoryResult)}
          </div>

          <div className="glass-card p-4">
            <p className="text-sm text-text-muted font-medium mb-2">📝 文件格式要求</p>
            <ul className="text-xs text-text-muted/70 space-y-1">
              <li>• 第一行作为表头</li>
              <li>• 必须包含「资产名称」或「规格型号」列</li>
              <li>• 支持列：资产代码、战区、盘点数量、实盘数量、保管人、使用部门、使用地点、备注、型号、门店、SN等</li>
              <li>• 文件编码支持：GBK、GB2312、UTF-8（带或不带BOM）</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'export' && (
        <div className="space-y-6">
          <div className="glass-card p-6 border-l-4 border-accent-blue">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-accent-blue/20 flex items-center justify-center text-xl">🏢</div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">固定资产数据导出</h2>
                <p className="text-xs text-text-muted">导出固定资产盘点数据</p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-text-muted mb-2">选择导出格式</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setFixedAssetExportFormat('csv')}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                    fixedAssetExportFormat === 'csv'
                      ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                      : 'bg-white/[0.02] text-text-secondary border-white/[0.04] hover:bg-white/[0.04]'
                  }`}
                >
                  📊 CSV
                </button>
                <button
                  onClick={() => setFixedAssetExportFormat('xlsx')}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                    fixedAssetExportFormat === 'xlsx'
                      ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30'
                      : 'bg-white/[0.02] text-text-secondary border-white/[0.04] hover:bg-white/[0.04]'
                  }`}
                >
                  📗 Excel
                </button>
                <button
                  onClick={() => setFixedAssetExportFormat('pdf')}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                    fixedAssetExportFormat === 'pdf'
                      ? 'bg-accent-green/20 text-accent-green border-accent-green/30'
                      : 'bg-white/[0.02] text-text-secondary border-white/[0.04] hover:bg-white/[0.04]'
                  }`}
                >
                  📕 PDF
                </button>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-text-muted mb-2">按战区筛选（可选）</label>
              <input
                type="text"
                value={fixedAssetZone}
                onChange={(e) => setFixedAssetZone(e.target.value)}
                placeholder="输入战区名称，如：深圳战区"
                className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-accent-blue/50 transition-colors"
              />
            </div>

            <button
              onClick={() => handleExport('fixed_asset_records', fixedAssetExportFormat, fixedAssetZone)}
              className="w-full py-3 rounded-xl bg-accent-blue/20 text-accent-blue border border-accent-blue/30 font-semibold hover:bg-accent-blue/30 hover:shadow-lg hover:shadow-accent-blue/10 transition-all duration-300 flex items-center justify-center gap-2"
            >
              📥 导出固定资产数据
            </button>
          </div>

          <div className="glass-card p-6 border-l-4 border-accent-cyan">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-accent-cyan/20 flex items-center justify-center text-xl">📦</div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">样机盘点数据导出</h2>
                <p className="text-xs text-text-muted">导出样机盘点数据</p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-text-muted mb-2">选择导出格式</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setInventoryExportFormat('csv')}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                    inventoryExportFormat === 'csv'
                      ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30'
                      : 'bg-white/[0.02] text-text-secondary border-white/[0.04] hover:bg-white/[0.04]'
                  }`}
                >
                  📊 CSV
                </button>
                <button
                  onClick={() => setInventoryExportFormat('xlsx')}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                    inventoryExportFormat === 'xlsx'
                      ? 'bg-accent-green/20 text-accent-green border-accent-green/30'
                      : 'bg-white/[0.02] text-text-secondary border-white/[0.04] hover:bg-white/[0.04]'
                  }`}
                >
                  📗 Excel
                </button>
                <button
                  onClick={() => setInventoryExportFormat('pdf')}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                    inventoryExportFormat === 'pdf'
                      ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                      : 'bg-white/[0.02] text-text-secondary border-white/[0.04] hover:bg-white/[0.04]'
                  }`}
                >
                  📕 PDF
                </button>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-text-muted mb-2">选择导出门店</label>
              <button
                onClick={loadStores}
                className="w-full py-3 rounded-xl bg-white/[0.02] text-text-secondary border border-white/[0.04] hover:bg-white/[0.04] text-sm transition-all duration-300 mb-3"
              >
                📋 加载门店列表（{storeList.length}个）
              </button>
              {showStorePicker && storeList.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-xl bg-black/20 border border-white/[0.06] p-2">
                  <label className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] rounded-lg cursor-pointer text-sm text-text-secondary">
                    <input type="checkbox" checked={selectedStores.size === storeList.length} onChange={selectAllStores} className="accent-accent-cyan" />
                    全选 ({storeList.length}个门店)
                  </label>
                  {storeList.map(s => (
                    <label key={s} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] rounded-lg cursor-pointer text-sm text-text-primary">
                      <input type="checkbox" checked={selectedStores.has(s)} onChange={() => toggleStore(s)} className="accent-accent-cyan" />
                      {s}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={batchExport}
              disabled={exporting || selectedStores.size === 0}
              className="w-full py-3 rounded-xl bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 font-semibold hover:bg-accent-cyan/30 hover:shadow-lg hover:shadow-accent-cyan/10 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? '导出中...' : `📥 导出${selectedStores.size > 0 ? `（${selectedStores.size}个门店）` : '样机盘点数据'}`}
            </button>
          </div>

          <div className="glass-card p-4">
            <p className="text-sm text-text-muted font-medium mb-2">💡 导出说明</p>
            <ul className="text-xs text-text-muted/70 space-y-1">
              <li>• CSV格式：通用格式，可用Excel/WPS打开</li>
              <li>• Excel格式：xlsx格式，保留完整表格样式</li>
              <li>• PDF格式：盘点报告格式，适合打印存档</li>
              <li>• 支持多门店选择，每个门店单独导出为一个文件</li>
              <li>• 选择多个门店时会依次下载，请允许浏览器多次下载</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'photos' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent-green/20 flex items-center justify-center text-xl">🖼️</div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">固定资产照片管理</h2>
                <p className="text-xs text-text-muted">查看和下载固定资产盘点照片</p>
              </div>
            </div>
            <button
              onClick={loadPhotos}
              disabled={loadingPhotos}
              className="px-4 py-2 rounded-lg bg-white/[0.02] text-text-secondary border border-white/[0.04] hover:bg-white/[0.04] text-sm transition-all duration-300 disabled:opacity-50"
            >
              {loadingPhotos ? '加载中...' : '🔄 刷新'}
            </button>
          </div>

          <div className="mb-5">
            <label className="block text-sm text-text-muted mb-2">按战区筛选（可选）</label>
            <input
              type="text"
              value={fixedAssetZone}
              onChange={(e) => setFixedAssetZone(e.target.value)}
              placeholder="输入战区名称，如：深圳战区"
              className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-accent-green/50 transition-colors"
            />
          </div>

          <button
            onClick={loadPhotos}
            disabled={loadingPhotos}
            className="w-full py-3 rounded-xl bg-accent-green/20 text-accent-green border border-accent-green/30 font-semibold hover:bg-accent-green/30 hover:shadow-lg hover:shadow-accent-green/10 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loadingPhotos ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" className="opacity-25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                加载中...
              </>
            ) : (
              '📷 加载照片列表'
            )}
          </button>

          {photos.length > 0 && (
            <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((photo, index) => (
                <div key={index} className="bg-white/[0.02] rounded-xl overflow-hidden border border-white/[0.04]">
                  <div className="aspect-video bg-black/30 flex items-center justify-center relative">
                    <img
                      src={`https://cloud1-d0g8kgm7o08c2d228.tcloudbase.com/${photo.fileID.replace(/^\//, '')}`}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect fill="%23333" width="200" height="150"/><text fill="%23666" x="100" y="80" text-anchor="middle" font-size="20">🖼️</text></svg>';
                      }}
                    />
                    <button
                      onClick={() => downloadPhoto(photo.fileID)}
                      className="absolute bottom-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                    >
                      ⬇️
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-text-primary truncate">{photo.name}</p>
                    {photo.zone && <p className="text-xs text-text-muted mt-1">📍 {photo.zone}</p>}
                    {photo.keeper && <p className="text-xs text-text-muted">👤 {photo.keeper}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {photos.length === 0 && !loadingPhotos && (
            <div className="mt-6 text-center py-12">
              <div className="text-4xl mb-4">📷</div>
              <p className="text-text-muted">暂无照片数据</p>
              <p className="text-xs text-text-muted/50 mt-2">请先进行盘点并拍摄资产照片</p>
            </div>
          )}

          <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <p className="text-sm text-text-muted font-medium mb-2">💡 照片说明</p>
            <ul className="text-xs text-text-muted/70 space-y-1">
              <li>• 照片仅显示固定资产记录（样机盘点无照片功能）</li>
              <li>• 点击下载按钮可保存照片到本地</li>
              <li>• 照片包含水印信息（资产名称、盘点人、战区、位置、时间）</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}