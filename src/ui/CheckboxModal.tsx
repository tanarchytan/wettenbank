"use client";

import { useState, useEffect } from "react";

export interface ModalOption {
  code: string;
  label: string;
  parent?: string | null;
}

interface Props {
  /** Form field name — multiple selected values posted as repeated query params. */
  name: string;
  buttonLabel: string;
  title: string;
  options: ReadonlyArray<ModalOption>;
  defaults?: ReadonlyArray<string> | undefined;
  /** Optional hierarchy: when set, group children under their parent. */
  hierarchical?: boolean;
}

export function CheckboxModal({
  name, buttonLabel, title, options, defaults, hierarchical = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(defaults ?? []));

  // Sync if defaults change between renders
  useEffect(() => {
    setSelected(new Set(defaults ?? []));
  }, [defaults]);

  function toggle(code: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const summary = selected.size === 0
    ? buttonLabel
    : `${buttonLabel} (${selected.size})`;

  return (
    <>
      {/* Hidden inputs so the form submits the current selection */}
      {[...selected].map((code) => (
        <input key={code} type="hidden" name={name} value={code} />
      ))}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-sm text-rijks-link hover:underline cursor-pointer"
      >
        {summary} <span aria-hidden="true">›</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`modal-${name}-title`}
          className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-12 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white border border-rijks-border w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between border-b border-rijks-border px-4 py-3">
              <h3 id={`modal-${name}-title`} className="text-base font-semibold text-rijks-blue m-0">
                {title}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Sluiten"
                className="text-rijks-text-subdued hover:text-rijks-link text-xl leading-none cursor-pointer px-2"
              >
                ×
              </button>
            </div>

            <div className="flex items-center gap-3 px-4 py-2 border-b border-rijks-border-soft text-sm">
              <button
                type="button"
                onClick={() => setSelected(new Set(options.map((o) => o.code)))}
                className="text-rijks-link hover:underline cursor-pointer"
              >
                Alles selecteren
              </button>
              <span className="text-rijks-border">|</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-rijks-link hover:underline cursor-pointer"
              >
                Selectie wissen
              </button>
              <span className="ml-auto text-rijks-text-subdued">
                {selected.size} geselecteerd
              </span>
            </div>

            <div className="overflow-y-auto px-4 py-3 flex-1">
              {hierarchical ? (
                <HierarchicalList options={options} selected={selected} onToggle={toggle} />
              ) : (
                <FlatList options={options} selected={selected} onToggle={toggle} />
              )}
            </div>

            <div className="border-t border-rijks-border px-4 py-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm px-4 py-1.5 border border-rijks-border bg-white hover:border-rijks-link cursor-pointer"
              >
                Klaar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FlatList({ options, selected, onToggle }: {
  options: ReadonlyArray<ModalOption>;
  selected: Set<string>;
  onToggle: (code: string) => void;
}) {
  return (
    <ul className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-3 text-sm">
      {options.map((o) => (
        <li key={o.code}>
          <label className="inline-flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(o.code)}
              onChange={() => onToggle(o.code)}
              className="accent-rijks-blue w-3.5 h-3.5 mt-0.5 flex-shrink-0"
            />
            <span>{o.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function HierarchicalList({ options, selected, onToggle }: {
  options: ReadonlyArray<ModalOption>;
  selected: Set<string>;
  onToggle: (code: string) => void;
}) {
  const roots = options.filter((o) => !o.parent);
  const childrenByParent = new Map<string, ModalOption[]>();
  for (const o of options) {
    if (o.parent) {
      const list = childrenByParent.get(o.parent) ?? [];
      list.push(o);
      childrenByParent.set(o.parent, list);
    }
  }
  return (
    <ul className="list-none p-0 m-0 space-y-3 text-sm">
      {roots.map((root) => {
        const children = childrenByParent.get(root.code) ?? [];
        return (
          <li key={root.code}>
            <label className="inline-flex items-start gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={selected.has(root.code)}
                onChange={() => onToggle(root.code)}
                className="accent-rijks-blue w-3.5 h-3.5 mt-0.5 flex-shrink-0"
              />
              <span>{root.label}</span>
            </label>
            {children.length > 0 && (
              <ul className="list-none pl-6 mt-1 space-y-1">
                {children.map((c) => (
                  <li key={c.code}>
                    <label className="inline-flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(c.code)}
                        onChange={() => onToggle(c.code)}
                        className="accent-rijks-blue w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                      />
                      <span>{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
