import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

const API_BASE = '';

export default function AccessPassword() {
  const [adminName, setAdminName] = useState('付建');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async () => {
    setMessage(null);
    const name = adminName.trim();
    if (!name) {
      setMessage({ type: 'error', text: '请输入管理员姓名' });
      return;
    }
    if (!oldPassword) {
      setMessage({ type: 'error', text: '请输入当前密码' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '新密码至少 6 位' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/access/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName: name, oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: 'success', text: '访问密码已更新，请使用新密码登录小程序' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: data.error || '修改失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '修改失败：' + ((err as Error).message || '后端未连接') });
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full px-4 py-3 rounded-xl bg-black/20 border border-white/[0.08] text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent-green/50 focus:ring-2 focus:ring-accent-green/10 transition-all duration-300';
  const labelCls = 'block text-sm font-medium text-text-secondary mb-2';

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors duration-300 mb-8 group"
      >
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        返回首页
      </Link>

      <div className="rounded-2xl p-6 sm:p-8 mb-8 border border-white/[0.04] bg-gradient-to-br from-green-500/5 via-transparent to-green-500/5">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-4xl flex-shrink-0">
            🔐
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 tracking-tight">
              修改小程序访问密码
            </h1>
            <p className="text-text-secondary/80">仅付建（管理员）可修改，需验证当前密码</p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className={labelCls}>管理员姓名</label>
            <input
              className={inputCls}
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="请输入管理员姓名（付建）"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelCls}>当前密码</label>
            <input
              className={inputCls}
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="请输入当前访问密码"
            />
          </div>
          <div>
            <label className={labelCls}>新密码（至少 6 位）</label>
            <input
              className={inputCls}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="请输入新密码"
            />
          </div>
          <div>
            <label className={labelCls}>确认新密码</label>
            <input
              className={inputCls}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入新密码"
            />
          </div>

          {message && (
            <div
              className={`px-4 py-3 rounded-xl text-sm border ${
                message.type === 'success'
                  ? 'bg-accent-green/10 text-accent-green border-accent-green/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
              submitting
                ? 'bg-accent-green/15 text-accent-green border border-accent-green/25 cursor-wait'
                : 'bg-gradient-to-r from-accent-green/20 to-accent-green/10 text-accent-green border border-accent-green/25 hover:shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)] hover:scale-[1.01] active:scale-[0.99]'
            }`}
          >
            {submitting ? '保存中...' : '保存新密码'}
          </button>
        </div>
      </div>
    </div>
  );
}
