import React from 'react';
import { ChevronDown } from 'lucide-react';
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: {
    value: string;
    label: string;
  }[];
}
export function Select({
  className = '',
  label,
  options,
  id,
  ...props
}: SelectProps) {
  const selectId = id || props.name || Math.random().toString(36).substr(2, 9);
  return (
    <div className="w-full space-y-2">
      {label &&
      <label
        htmlFor={selectId}
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">

          {label}
        </label>
      }
      <div className="relative">
        <select
          id={selectId}
          className={`flex h-12 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
          {...props}>

          {options.map((option) =>
          <option key={option.value} value={option.value}>
              {option.label}
            </option>
          )}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50 pointer-events-none" />
      </div>
    </div>);

}