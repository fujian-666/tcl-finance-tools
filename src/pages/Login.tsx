import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true); // 初始为免密自动登录中
  const [autoFailed, setAutoFailed] = useState(false);
  const [error, setError] = useState('');

  // 本机(localhost)访问免密自动登录；失败（如远程访问）才显示密码表单
  useEffect(() => {
    let cancelled = false;
    login('').then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        navigate('/', { replace: true });
      } else {
        setAutoFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;
    setLoading(true);
    setError('');
    const result = await login(password);
    setLoading(false);
    if (result.ok) {
      navigate('/', { replace: true });
    } else {
      setError(result.error || '登录失败');
    }
  };

  return (
    <div className="min-h-[calc(100vh-220px)] flex items-center justify-center animate-fade-in">
      <div className="w-full max-w-sm">
        <div className="glass-card p-8 rounded-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-[96px] h-[36px] rounded-lg bg-white flex items-center justify-center overflow-hidden shadow-[0_0_16px_-2px_rgba(255,255,255,0.18)] mb-5">
              <img src="/TCL.png" alt="TCL" className="w-[125%] h-[125%] max-w-none object-contain brightness-110 contrast-110" />
            </div>
            <h1 className="text-lg font-bold text-text-primary tracking-tight mb-1">
              财务小工具平台
            </h1>
            <p className="text-xs text-text-muted">仅限华南大区内部人员使用</p>
          </div>

          {!autoFailed ? (
            <div className="flex flex-col items-center py-10 gap-4">
              <svg className="w-10 h-10 animate-spin text-accent-blue" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" className="opacity-25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <p className="text-xs text-text-muted">本机免密登录中...</p>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs text-text-muted mb-2">登录密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入管理密码"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-accent-blue/50 transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full py-3 rounded-xl bg-accent-blue/20 text-accent-blue border border-accent-blue/30 font-semibold hover:bg-accent-blue/30 hover:shadow-lg hover:shadow-accent-blue/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" className="opacity-25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  登录中...
                </>
              ) : (
                '登 录'
              )}
            </button>
          </form>
          )}
        </div>

        <p className="text-center text-[11px] text-text-muted/60 mt-6">
          本平台为内部工具，请勿将登录密码告知无关人员
        </p>
      </div>
    </div>
  );
}
