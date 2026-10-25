"use client";

import { useRef, useState } from "react";
import { KEY_RE, KEY_STORE, savedKey } from "@/lib/read";
import { Lock } from "./icons";

/** Lets a visitor use their own Gemini key for the AI reader. Kept only in this browser. */
export function AiKey({ label = "AI key" }: { label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [has, setHas] = useState(false);
  const [error, setError] = useState("");

  const open = () => {
    setHas(savedKey() !== null);
    setValue("");
    setError("");
    dialog.current?.showModal();
  };
  const save = () => {
    const k = value.trim();
    if (!KEY_RE.test(k)) return setError("That doesn't look like an API key.");
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      return setError("This browser won't let Stitchproof save it (private mode?).");
    }
    dialog.current?.close();
  };
  const remove = () => {
    try {
      localStorage.removeItem(KEY_STORE);
    } catch {}
    setHas(false);
  };

  return (
    <>
      <button type="button" onClick={open} className="inline-flex items-center gap-1 rounded-full text-[12px] font-medium text-accent hover:underline">
        <Lock size={13} /> {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="aikey-title"
        className="m-auto w-[min(480px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-ink shadow-[var(--shadow-2)] backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <form
          className="p-6 sm:p-7"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2 id="aikey-title" className="text-[19px] font-semibold tracking-[-0.02em]">Use your own AI key</h2>
          <p className="mt-1 text-[14px] text-ink-2">
            Paste a Google Gemini API key (free at{" "}
            <a className="text-accent underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              aistudio.google.com
            </a>
            ). It is saved only in this browser and sent only with AI readings. Stitchproof never stores or logs it.
          </p>
          <label htmlFor="aikey-input" className="mt-5 block text-[13px] font-medium">
            Gemini API key {has && <span className="font-normal text-ok">· one is saved</span>}
          </label>
          <input
            id="aikey-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={has ? "Paste a new key to replace it" : "AIza…"}
            className="mono mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[13px] outline-none focus:border-accent"
          />
          {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-sm">Save key</button>
            {has && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={remove}>Remove key</button>
            )}
            <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => dialog.current?.close()}>Close</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
