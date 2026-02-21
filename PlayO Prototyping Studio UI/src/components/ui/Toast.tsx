import React, { useEffect } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';
export type ToastType = 'success' | 'error' | 'info';
interface ToastProps {
  message: string;
  type: ToastType;
  visible: boolean;
  onDismiss: () => void;
}
export function Toast({ message, type, visible, onDismiss }: ToastProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, onDismiss]);
  if (!visible) return null;
  const bgColors = {
    success: 'bg-[#00D4AA]',
    error: 'bg-red-500',
    info: 'bg-gray-800'
  };
  const icons = {
    success: <Check className="w-5 h-5 text-white" />,
    error: <AlertCircle className="w-5 h-5 text-white" />,
    info: <Info className="w-5 h-5 text-white" />
  };
  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-3 rounded-full shadow-lg ${bgColors[type]} animate-slide-up transition-all duration-300 min-w-[300px] max-w-[90vw]`}>

      <div className="flex-shrink-0">{icons[type]}</div>
      <p className="text-white font-medium text-sm flex-1">{message}</p>
      <button
        onClick={onDismiss}
        className="text-white/80 hover:text-white transition-colors">

        <X className="w-4 h-4" />
      </button>
    </div>);

}