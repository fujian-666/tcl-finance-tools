import { useState, useMemo, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { tools, platformStats, type Category } from '../data/tools';
import SearchBar from '../components/SearchBar';
import CategoryFilter from '../components/CategoryFilter';
import ToolCard from '../components/ToolCard';
import HeatDashboard from '../components/HeatDashboard';

export default function Home() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('全部');
  const [callCounts, setCallCounts] = useState<Record<string, number>>({});

  // 实时拉取各工具调用次数（替代静态 totalCalls）
  useEffect(() => {
    apiFetch('/api/tools/call-counts')
      .then(r => r.json())
      .then(d => { if (d && typeof d === 'object') setCallCounts(d); })
      .catch(() => {});
  }, []);

  const realTotalCalls = Object.values(callCounts).reduce((a, b) => a + (Number(b) || 0), 0);

  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      const matchSearch =
        !search ||
        tool.name.toLowerCase().includes(search.toLowerCase()) ||
        tool.description.toLowerCase().includes(search.toLowerCase()) ||
        tool.tag.toLowerCase().includes(search.toLowerCase());
      const matchCategory =
        category === '全部' || tool.name === category;
      return matchSearch && matchCategory;
    });
  }, [search, category]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 搜索栏 + 平台统计 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <SearchBar value={search} onChange={setSearch} />
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            {platformStats.totalTools}个在线应用
          </span>
          <span className="w-px h-3 bg-white/[0.06]" />
          <span className="flex items-center gap-1.5">
            总调用 <span className="text-text-primary font-semibold">{realTotalCalls > 0 ? realTotalCalls : platformStats.totalCalls}</span> 次
          </span>
          <span className="w-px h-3 bg-white/[0.06]" />
          <span className="flex items-center gap-1.5">
            环比 <span className="text-accent-green font-semibold">+{platformStats.weeklyGrowth}%</span>
          </span>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-4 flex flex-col items-center text-center gap-1.5 group hover:scale-[1.03] transition-all duration-500 relative overflow-hidden animate-slide-up" style={{ animationDelay: '50ms' }}>
          <div className="absolute inset-0 bg-gradient-to-b from-accent-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative w-9 h-9 rounded-lg bg-accent-blue/10 flex items-center justify-center group-hover:bg-accent-blue/20 group-hover:scale-110 group-hover:glow-blue transition-all duration-500">
            <svg className="w-4.5 h-4.5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <div className="relative">
            <p className="text-lg font-bold text-text-primary">{platformStats.totalTools}</p>
            <p className="text-[10px] text-text-muted">在线应用</p>
          </div>
        </div>
        <div className="glass-card p-4 flex flex-col items-center text-center gap-1.5 group hover:scale-[1.03] transition-all duration-500 relative overflow-hidden animate-slide-up" style={{ animationDelay: '120ms' }}>
          <div className="absolute inset-0 bg-gradient-to-b from-accent-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative w-9 h-9 rounded-lg bg-accent-cyan/10 flex items-center justify-center group-hover:bg-accent-cyan/20 group-hover:scale-110 group-hover:glow-cyan transition-all duration-500">
            <svg className="w-4.5 h-4.5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="relative">
            <p className="text-lg font-bold text-text-primary">{platformStats.totalCalls}</p>
            <p className="text-[10px] text-text-muted">总调用量</p>
          </div>
        </div>
        <div className="glass-card p-4 flex flex-col items-center text-center gap-1.5 group hover:scale-[1.03] transition-all duration-500 relative overflow-hidden animate-slide-up" style={{ animationDelay: '190ms' }}>
          <div className="absolute inset-0 bg-gradient-to-b from-accent-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative w-9 h-9 rounded-lg bg-accent-green/10 flex items-center justify-center group-hover:bg-accent-green/20 group-hover:scale-110 group-hover:glow-green transition-all duration-500">
            <svg className="w-4.5 h-4.5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </div>
          <div className="relative">
            <p className="text-lg font-bold text-accent-green">+{platformStats.weeklyGrowth}%</p>
            <p className="text-[10px] text-text-muted">环比增长</p>
          </div>
        </div>
        <div className="glass-card p-4 flex flex-col items-center text-center gap-1.5 group hover:scale-[1.03] transition-all duration-500 relative overflow-hidden animate-slide-up" style={{ animationDelay: '260ms' }}>
          <div className="absolute inset-0 bg-gradient-to-b from-accent-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative w-9 h-9 rounded-lg bg-accent-purple/10 flex items-center justify-center group-hover:bg-accent-purple/20 group-hover:scale-110 group-hover:glow-purple transition-all duration-500">
            <svg className="w-4.5 h-4.5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="relative">
            <p className="text-lg font-bold text-text-primary">{platformStats.platformVersion}</p>
            <p className="text-[10px] text-text-muted">平台版本</p>
          </div>
        </div>
      </div>

      <CategoryFilter selected={category} onChange={setCategory} />

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        <span className="text-xs text-text-muted/60 font-medium tracking-wider flex items-center gap-2">
          <span className="text-accent-purple">◆</span>
          {filteredTools.length} 个工具
          <span className="text-accent-purple">◆</span>
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {filteredTools.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTools.map((tool, i) => (
            <ToolCard key={tool.id} tool={tool} index={i} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-text-muted text-base">未找到匹配的工具</p>
          <p className="text-text-muted/60 text-sm mt-1">尝试调整搜索关键词或筛选条件</p>
        </div>
      )}

      <HeatDashboard callCounts={callCounts} />
    </div>
  );
}