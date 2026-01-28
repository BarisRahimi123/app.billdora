import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export default function LoadingButton({
  loading = false,
  loadingText,
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}: LoadingButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantStyles = {
    primary: 'bg-[#476E66] text-white hover:bg-[#3A5B54]',
    secondary: 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-neutral-700 hover:bg-neutral-100',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
