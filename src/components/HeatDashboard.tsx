import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { tools } from '../data/tools';

type TimeRange = '7D' | '30D' | 'All';

const timeRangeLabels: Record<TimeRange, string> = {
  '7D': '近7天',
  '30D': '近30天',
  All: '全部',
};

const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const monthLabels = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

const colorMap = ['#3B82F6', '#06B6D4', '#8B5CF6', '#F59E0B', '#10B981', '#F97316'];

interface HeatDashboardProps {
  callCounts?: Record<string, number>;
}

export default function HeatDashboard({ callCounts = {} }: HeatDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('7D');

  // 排序用实时调用次数（未取到实时数据时回退静态值）
  const sortedTools = [...tools].sort((a, b) =>
    (callCounts[b.id] ?? b.callCount) - (callCounts[a.id] ?? a.callCount)
  );

  const chartData =
    timeRange === '7D'
      ? dayLabels.map((day, i) => {
          const entry: Record<string, string | number> = { name: day };
          tools.forEach((t) => {
            entry[t.name] = t.weeklyTrend[i] || 0;
          });
          return entry;
        })
      : timeRange === '30D'
        ? monthLabels.map((month, i) => {
            const entry: Record<string, string | number> = { name: month };
            tools.forEach((t) => {
              entry[t.name] = t.monthlyTrend[i] || 0;
            });
            return entry;
          })
        : monthLabels.map((month, i) => {
            const entry: Record<string, string | number> = { name: month };
            tools.forEach((t) => {
              entry[t.name] = t.monthlyTrend[i] || 0;
            });
            return entry;
          });

  return (
    <div className="glass-card p-6 animate-slide-up relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-accent-blue/[0.02] via-transparent to-accent-purple/[0.02]" />
      <div className="relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">调度热度看板</h3>
          <p className="text-sm text-text-muted mt-1">工具调用排名及趋势分析</p>
        </div>
        <div className="flex gap-1 bg-white/[0.02] rounded-lg p-1 border border-white/[0.04]">
          {(['7D', '30D', 'All'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
                timeRange === range
                  ? 'bg-accent-blue/15 text-accent-blue shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {timeRangeLabels[range]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
                  tickLine={false}
                  allowDecimals={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1A2E',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    color: '#F1F5F9',
                    fontSize: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}
                />
                {tools.map((tool, i) => (
                  <Line
                    key={tool.id}
                    type="monotone"
                    dataKey={tool.name}
                    stroke={colorMap[i]}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: colorMap[i], strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: colorMap[i], strokeWidth: 2, stroke: 'rgba(255,255,255,0.3)' }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4">
            {tools.map((tool, i) => (
              <div key={tool.id} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shadow-sm"
                  style={{ backgroundColor: colorMap[i], boxShadow: `0 0 8px ${colorMap[i]}40` }}
                />
                <span className="text-xs text-text-muted">{tool.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-secondary mb-3">
            {timeRange === '7D' ? '近7天' : timeRange === '30D' ? '近30天' : '累计'}调用排名
          </h4>
          {sortedTools.map((tool, i) => (
            <div
              key={tool.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all duration-300"
            >
              <span
                className="flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold"
                style={{
                  backgroundColor: `${colorMap[i]}20`,
                  color: colorMap[i],
                }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {tool.name}
                </p>
                <p className="text-[10px] text-text-muted">{tool.tag}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums" style={{ color: colorMap[i] }}>
                  {tool.callCount}
                </p>
                <p className="text-[10px] text-text-muted">次</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}