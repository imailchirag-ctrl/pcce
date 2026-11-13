"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  href?: string;
  run?: () => void;
};

export function CommandPalette({
  open,
  onClose,
  items,
  searchLabel,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  searchLabel: string;
  onSearch: (term: string) => void;
}) {
  return (
    <AnimatePresence>
      {open && <PaletteDialog onClose={onClose} items={items} searchLabel={searchLabel} onSearch={onSearch} />}
    </AnimatePresence>
  );
}

function PaletteDialog({
  onClose,
  items,
  searchLabel,
  onSearch,
}: {
  onClose: () => void;
  items: PaletteItem[];
  searchLabel: string;
  onSearch: (term: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matched = term
      ? items.filter((item) => `${item.label} ${item.hint ?? ""} ${item.group}`.toLowerCase().includes(term))
      : items;
    if (!term) return matched;
    const searchItem: PaletteItem = {
      id: "__search",
      label: `${searchLabel} “${query.trim()}”`,
      group: "Search",
      icon: Search,
      run: () => onSearch(query.trim()),
    };
    return [...matched, searchItem];
  }, [items, query, searchLabel, onSearch]);

  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    if (item.run) item.run();
    else if (item.href) router.push(item.href);
  };

  const move = (delta: number) => {
    if (!results.length) return;
    const next = (activeIndex + delta + results.length) % results.length;
    setActive(next);
    listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-[#24211D]/35 px-4 pt-[12vh] backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#EDE6DA] bg-white shadow-[0_30px_80px_-20px_rgba(36,33,29,0.45)]"
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[#EDE6DA] px-4">
          <Search size={17} className="text-[#A1743A]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(results[activeIndex]);
              } else if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Jump to a page or search…"
            aria-label="Search commands"
            aria-activedescendant={results[activeIndex] ? `cmd-${results[activeIndex].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-[15px] text-[#24211D] outline-none placeholder:text-[#9E9589]"
          />
          <kbd className="rounded-md border border-[#EDE6DA] bg-[#FFFCF6] px-1.5 py-0.5 text-[10px] font-semibold text-[#6F675C]">ESC</kbd>
        </div>
        <div ref={listRef} role="listbox" className="max-h-[360px] overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-[#6F675C]">No matches. Try another word.</p>}
          {results.map((item, index) => {
            const header = item.group !== results[index - 1]?.group ? item.group : null;
            const Icon = item.icon;
            const selected = index === activeIndex;
            return (
              <div key={item.id}>
                {header && <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#A1743A]">{header}</p>}
                <button
                  id={`cmd-${item.id}`}
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm active:scale-100",
                    selected ? "bg-[#FFF5E5] text-[#24211D]" : "text-[#4A443C]",
                  )}
                >
                  <span className={cn("grid size-8 place-items-center rounded-lg", selected ? "bg-[#F4B942] text-[#75451F]" : "bg-[#FFFCF6] text-[#75451F]")}>
                    <Icon size={15} />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{item.label}</span>
                    {item.hint && <span className="block text-[11px] text-[#8A7F71]">{item.hint}</span>}
                  </span>
                  {selected && <CornerDownLeft size={14} className="text-[#A1743A]" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-[#EDE6DA] bg-[#FFFCF6] px-4 py-2 text-[10px] text-[#8A7F71]">
          <span><kbd className="font-semibold">↑↓</kbd> navigate</span>
          <span><kbd className="font-semibold">↵</kbd> open</span>
          <span className="ml-auto">SkillBridge command bar</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
