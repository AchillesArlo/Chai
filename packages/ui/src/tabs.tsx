'use client';

import { useState, type ReactNode } from 'react';

export interface TabItem {
  content: ReactNode;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  defaultIndex?: number;
}

export function Tabs({ items, defaultIndex = 0 }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);

  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <div
        className="flex gap-1 border-b border-slate-200"
        role="tablist"
      >
        {items.map((item, i) => (
          <button
            aria-selected={i === activeIndex}
            className={`px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              i === activeIndex
                ? 'border-b-2 border-brand-600 text-brand-700'
                : 'border-b-2 border-transparent text-slate-600 hover:text-slate-950'
            }`}
            id={`tab-${i}`}
            key={i}
            onClick={() => setActiveIndex(i)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`tab-${activeIndex}`}
        role="tabpanel"
      >
        {items[activeIndex]?.content}
      </div>
    </div>
  );
}
