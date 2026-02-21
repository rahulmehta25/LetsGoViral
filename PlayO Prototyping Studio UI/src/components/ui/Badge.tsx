import React from 'react';
interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline';
  children: React.ReactNode;
  className?: string;
}
export function Badge({
  variant = 'default',
  children,
  className = ''
}: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-[#00D4AA]/10 text-[#00D4AA]',
    warning: 'bg-amber-100 text-amber-700',
    destructive: 'bg-red-100 text-red-700',
    outline: 'border border-current bg-transparent text-gray-500'
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${variants[variant]} ${className}`}>

      {children}
    </span>);

}