'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface DropdownItem {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}

export interface DropdownProps {
  align?: 'left' | 'right';
  items: DropdownItem[];
  trigger: ReactNode;
}

export function Dropdown({ align = 'left', items, trigger }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleItemClick(item: DropdownItem) {
    item.onClick();
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        type="button"
      >
        {trigger}
      </button>
      {open ? (
        <div
          className={`absolute z-30 mt-1 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          role="menu"
        >
          {items.map((item, i) => (
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              key={i}
              onClick={() => handleItemClick(item)}
              role="menuitem"
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
