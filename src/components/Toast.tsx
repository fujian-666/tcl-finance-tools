import { useToast, type ToastItem } from '../contexts/ToastContext';

const iconMap: Record<ToastItem['type'], string> = {
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  error: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

const bgMap: Record<ToastItem['type'], string> = {
  success: 'bg-accent-green/10 border-accent-green/25',
  error: 'bg-red-500/10 border-red-500/25',
  warning: 'bg-amber-500/10 border-amber-500/25',
  info: 'bg-accent-blue/10 border-accent-blue/25',
};

const textMap: Record<ToastItem['type'], string> = {
  success: 'text-accent-green',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-accent-blue',
};

const progressMap: Record<ToastItem['type'], string> = {
  success: 'bg-accent-green',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-accent-blue',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-xl border p-4 backdrop-blur-xl animate-slide-in-right overflow-hidden relative ${bgMap[toast.type]}`}
        >
          <div className="absolute bottom-0 left-0 h-0.5 rounded-full animate-toast-progress" style={{
            background: progressMap[toast.type] === 'bg-accent-green' ? '#10b981' :
                        progressMap[toast.type] === 'bg-red-500' ? '#ef4444' :
                        progressMap[toast.type] === 'bg-amber-500' ? '#f59e0b' : '#3b82f6',
            animationDuration: `${toast.duration ?? 5000}ms`,
          }} />
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 w-5 h-5 mt-0.5 ${textMap[toast.type]}`}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={iconMap[toast.type]} />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${textMap[toast.type]}`}>{toast.title}</p>
              {toast.message && (
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 w-5 h-5 rounded-md hover:bg-white/[0.08] flex items-center justify-center transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}