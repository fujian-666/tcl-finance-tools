import { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative w-full max-w-md sm:max-w-lg">
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${
          isFocused
            ? 'border-accent-blue/50 bg-bg-card shadow-lg shadow-accent-blue/5 ring-1 ring-accent-blue/10'
            : 'border-border-card bg-bg-card/50 hover:border-white/[0.08]'
        }`}
      >
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-colors duration-300 ${isFocused ? 'text-accent-blue' : 'text-text-muted'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="搜索工具名称、功能描述..."
          className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="flex-shrink-0 w-5 h-5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors duration-200"
            aria-label="清除搜索"
          >
            <svg className="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/5 text-xs text-text-muted border border-border-card font-sans">
          <span className="text-[10px]">⌘</span>K
        </kbd>
      </div>
    </div>
  );
}