import React from 'react';
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
}
export function Card({
  className = '',
  noPadding = false,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-xl border bg-card text-card-foreground shadow-sm ${className}`}
      {...props}>

      <div className={noPadding ? '' : 'p-6'}>{children}</div>
    </div>);

}