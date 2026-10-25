"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

export type LineMark = "issue" | "unread" | "warn" | "ok" | "fixed";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  marks?: Map<number, LineMark>;
  placeholder?: string;
  disabled?: boolean;
}

export interface EditorHandle {
  focusLine: (line: number) => void;
}

const MARK_COLOR: Record<LineMark, string> = {
  issue: "var(--bad)",
  unread: "var(--warn)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  fixed: "var(--accent)",
};

export const PatternEditor = forwardRef<EditorHandle, Props>(function PatternEditor(
  { value, onChange, onSubmit, marks, placeholder, disabled },
  ref,
) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split("\n").length;

  useImperativeHandle(ref, () => ({
    focusLine(line: number) {
      const el = ta.current;
      if (!el) return;
      const parts = el.value.split("\n");
      const start = parts.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
      el.focus({ preventScroll: true });
      el.setSelectionRange(start, start + (parts[line]?.length ?? 0));
      const lh = 13 * 1.7;
      el.scrollTop = Math.max(0, line * lh - el.clientHeight / 3);
    },
  }));

  return (
    <div className="editor relative flex min-h-0 flex-1 overflow-hidden">
      <div
        ref={gutter}
        aria-hidden
        className="select-none overflow-hidden border-r border-line bg-surface-2 py-4 pr-2 pl-3 text-right text-ink-3 tnum"
        style={{ width: lines >= 100 ? 52 : 44 }}
      >
        {Array.from({ length: Math.max(lines, 1) }, (_, i) => {
          const m = marks?.get(i);
          return (
            <div key={i} className="relative">
              {m && (
                <span
                  className="absolute top-1/2 -left-1.5 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
                  style={{ background: MARK_COLOR[m] }}
                />
              )}
              {i + 1}
            </div>
          );
        })}
      </div>
      <textarea
        ref={ta}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        placeholder={placeholder}
        aria-label="Knitting pattern"
        className="min-h-0 flex-1 overflow-auto px-4 py-4 whitespace-pre text-ink placeholder:text-ink-3"
      />
    </div>
  );
});
