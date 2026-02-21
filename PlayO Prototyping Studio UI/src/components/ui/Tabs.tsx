import React from 'react';
interface TabsProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  className?: string;
}
export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  className = ''
}: TabsProps) {
  return (
    <div className={`bg-white p-1 rounded-full shadow-sm flex ${className}`}>
      {tabs.map((tab) =>
      <button
        key={tab}
        onClick={() => onTabChange(tab)}
        className={`flex-1 py-2 text-sm font-bold rounded-full transition-all duration-200 ${activeTab === tab ? 'bg-black text-white shadow-md transform scale-105' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>

          {tab}
        </button>
      )}
    </div>);

}