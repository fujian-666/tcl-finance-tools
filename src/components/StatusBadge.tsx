interface StatusBadgeProps {
  status: 'online' | 'offline';
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const sizeClasses = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`${sizeClasses} rounded-full ${
          status === 'online'
            ? 'bg-accent-green animate-pulse-green'
            : 'bg-text-muted'
        }`}
      />
      <span
        className={`${textSize} font-medium ${
          status === 'online' ? 'text-accent-green' : 'text-text-muted'
        }`}
      >
        {status === 'online' ? '在线' : '离线'}
      </span>
    </span>
  );
}