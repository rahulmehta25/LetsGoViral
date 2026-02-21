import React from 'react';
import { Check } from 'lucide-react';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  isValid?: boolean;
}
export function Input({
  className = '',
  label,
  error,
  isValid,
  id,
  ...props
}: InputProps) {
  const inputId = id || props.name || Math.random().toString(36).substr(2, 9);
  return (
    <div className="w-full space-y-2">
      {label &&
      <label
        htmlFor={inputId}
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">

          {label}
        </label>
      }
      <div className="relative">
        <input
          id={inputId}
          className={`flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-destructive' : ''} ${isValid ? 'border-green-500 pr-10' : ''} ${className}`}
          {...props} />

        {isValid &&
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none">
            <Check className="h-5 w-5" />
          </div>
        }
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>);

}