import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

/** The mark: a knit stitch whose two legs form a check. */
export function Logo({ size = 28, ...p }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden {...p}>
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <g fill="none" stroke="var(--paper)" strokeWidth="2.1" strokeLinecap="round">
        <path d="M9.2 15.6c1.9.3 3.9 2.4 5.7 6.2" />
        <path d="M9.2 15.6c-.2 2.1 1.6 4.5 5.7 6.2" opacity=".55" />
        <path d="M14.9 21.8c1.6-5.4 4.4-9.7 8.1-12.4" />
        <path d="M14.9 21.8c3.4-1.9 6.4-6.4 8.1-12.4" opacity=".55" />
      </g>
    </svg>
  );
}

export const Check = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 12.5l4.2 4.2L19 7" /></svg>
);
export const Alert = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 8v5" /><path d="M12 16.5h.01" /><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
);
export const Question = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" /><path d="M12 17h.01" /></svg>
);
export const Arrow = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
);
export const ArrowLeft = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></svg>
);
export const Chevron = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m9 6 6 6-6 6" /></svg>
);
export const ChevronDown = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const Wand = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m4 20 11-11" /><path d="m13 7 4 4" /><path d="M18 3v3M16.5 4.5h3M20 9v2M19 10h2" /></svg>
);
export const Needles = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 19 19 5" /><path d="M5 5l14 14" /><circle cx="18.5" cy="5.5" r="1.4" /><circle cx="18.5" cy="18.5" r="1.4" /></svg>
);
export const Doc = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>
);
export const Trash = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></svg>
);
export const Sparkline = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 18h16" /><path d="M6 15h12M8 12h8M10 9h4" /></svg>
);
export const Link2 = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
);
export const Lock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const Github = ({ size = 18, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
  </svg>
);
