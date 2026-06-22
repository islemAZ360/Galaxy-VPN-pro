'use client';

import { useState, useRef, useEffect } from 'react';
import { Trash2, ChevronDown, Check } from 'lucide-react';
import { deleteAllServers, deleteServersByType } from '@/lib/admin-actions';

interface DeleteServersFormProps {
  tiers: [string, number][];
  netLabels: Record<string, any>;
  t: any;
}

export default function DeleteServersForm({ tiers, netLabels, t }: DeleteServersFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string>('all');
  const [isDeleting, setIsDeleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = [
    { value: 'all', label: t.deleteAll },
    ...tiers.map(([t]) => ({ value: t, label: netLabels[t]?.label || t }))
  ];

  const selectedOption = options.find(o => o.value === selected) || options[0];

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete these servers?')) return;
    setIsDeleting(true);
    try {
      if (selected === 'all') {
        await deleteAllServers();
      } else {
        await deleteServersByType(selected);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 relative" ref={dropdownRef}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between gap-2 w-48 rounded-lg border border-red-500/40 bg-[#0f111a] px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/20"
        >
          <span className="truncate">{selectedOption.label}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute top-full mt-1.5 w-full rounded-lg border border-white/10 bg-[#161b26] p-1 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setSelected(opt.value);
                  setIsOpen(false);
                }}
                className={`flex items-center justify-between w-full rounded-md px-2.5 py-1.5 text-xs text-left transition-colors ${
                  selected === opt.value 
                    ? 'bg-red-500/10 text-red-400 font-medium' 
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {selected === opt.value && <Check className="h-3 w-3" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <button 
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {isDeleting ? '...' : t.delete}
      </button>
    </div>
  );
}
