import React from 'react';

export default function ButtonSignature({
  children,
  icon,
  onClick,
  type = 'button',
  variant = 'primary', // 'primary' | 'secondary' | 'emerald' | 'amber' | 'danger'
  size = 'md', // 'sm' | 'md' | 'lg'
  className = '',
  disabled = false,
  title,
}) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs font-semibold rounded-xl min-h-[38px] gap-1.5',
    md: 'px-4 py-2.5 text-sm font-semibold rounded-2xl min-h-[46px] gap-2',
    lg: 'px-6 py-3.5 text-base font-bold rounded-2xl min-h-[54px] gap-2.5',
  }[size] || 'px-4 py-2.5 text-sm font-semibold rounded-2xl min-h-[46px] gap-2';

  const variantClasses = {
    primary: 'bg-white border-2 border-primary text-primary hover:bg-sage-soft hover:border-primary-container shadow-sm hover:shadow',
    secondary: 'bg-white border-2 border-outline-variant text-on-surface hover:border-outline hover:bg-canvas-slate shadow-sm',
    emerald: 'bg-white border-2 border-emerald-600 text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50/60 hover:border-emerald-700 shadow-sm hover:shadow',
    amber: 'bg-white border-2 border-amber-rich text-amber-rich hover:bg-amber-soft hover:border-amber-700 shadow-sm hover:shadow',
    danger: 'bg-white border-2 border-error text-error hover:bg-error-container/30 shadow-sm',
  }[variant] || 'bg-white border-2 border-primary text-primary hover:bg-sage-soft shadow-sm';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses} ${className}`}
    >
      {icon && (
        <span className="material-symbols-outlined text-[20px] shrink-0">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </button>
  );
}
