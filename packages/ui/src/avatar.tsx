'use client';

export interface AvatarProps {
  alt: string;
  fallback?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  src?: string;
}

const sizeStyles = {
  lg: 'size-12 text-lg',
  md: 'size-9 text-sm',
  sm: 'size-7 text-xs',
  xs: 'size-5 text-[10px]',
};

export function Avatar({ alt, fallback, size = 'md', src }: AvatarProps) {
  const initials = (fallback ?? alt)
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (src) {
    return (
      <img
        alt={alt}
        className={`inline-block rounded-full ${sizeStyles[size]}`}
        src={src}
      />
    );
  }

  return (
    <span
      aria-label={alt}
      className={`inline-flex items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ${sizeStyles[size]}`}
      role="img"
    >
      {initials}
    </span>
  );
}
