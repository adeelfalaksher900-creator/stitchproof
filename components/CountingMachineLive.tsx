"use client";

import { useEffect, useRef } from "react";
import { translateAlong, type Projection } from "@/lib/iso/iso-kit";
import { countAt, END, markerAt, MAKES, needleAt, START, STATED, tipHeight, USES } from "@/lib/figure/machine";

type Phase = "rest" | "read" | "verdict" | "return";
const DURATION: Record<Phase, number> = { rest: 1.3, read: 4.6, verdict: 2.6, return: 1.2 };
const ORDER: Phase[] = ["rest", "read", "verdict", "return"];

export function CountingMachineLive({ svg, P }: { svg: string; P: Projection }) {
  const stage = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const el = root.querySelector("svg")!;
    const carriage = el.querySelector<SVGGElement>('[data-part="carriage"]')!;
    const plunger = el.querySelector<SVGGElement>('[data-part="plunger"]')!;
    const needle = el.querySelector<SVGPathElement>('[data-part="needle"]')!;
    const marker = el.querySelector<SVGPathElement>('[data-part="marker"]')!;
    const lamp = el.querySelector<SVGGElement>('[data-part="lamp"]')!;
    const still = matchMedia("(prefers-reduced-motion: reduce)");

    let x = START;
    let target = START;
    let shown = 0; // needle position, in stitches
    let mark = STATED[0] as number;
    let markShown = mark;
    let statedIndex = 0;
    const tip = { at: tipHeight(x), rate: 0 };
    let touring = !still.matches;
    let phase: Phase = "rest";
    let clock = 0;
    let frame = 0;
    let last = 0;
    let visible = false;
    let idle = 0;

    const verdict = () => {
      const { made } = countAt(x);
      if (Math.abs(x - END) > 1) return "off";
      return made === mark ? "ok" : "bad";
    };

    const draw = () => {
      carriage.setAttribute("transform", translateAlong(P, [x, 0, 0]));
      plunger.setAttribute("transform", translateAlong(P, [0, 0, tip.at]));
      needle.setAttribute("d", needleAt(shown, P));
      marker.setAttribute("d", markerAt(markShown, P));
      const v = verdict();
      lamp.setAttribute("data-state", v);
      const { made, used } = countAt(x);
      const text =
        v === "off"
          ? `uses ${used} of ${USES} · makes ${made} · pattern says ${mark}`
          : v === "ok"
            ? `makes ${made} · pattern says ${mark} · adds up`
            : `makes ${made} · pattern says ${mark} · doesn't add up`;
      if (readout.current && readout.current.textContent !== text) readout.current.textContent = text;
      root.setAttribute("aria-valuenow", String(made));
      root.setAttribute("aria-valuetext", text);
    };

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      const calm = still.matches;
      if (touring) {
        clock += dt;
        if (clock > DURATION[phase]) {
          clock = 0;
          phase = ORDER[(ORDER.indexOf(phase) + 1) % ORDER.length];
          if (phase === "rest") {
            statedIndex = (statedIndex + 1) % STATED.length;
            mark = STATED[statedIndex];
          }
        }
        if (phase === "rest") target = START;
        if (phase === "read") target = START + (END - START) * Math.min(1, clock / (DURATION.read - 0.4));
        if (phase === "verdict") target = END;
        if (phase === "return") target = START;
      }
      // Carriage: linear while reading, eased otherwise.
      const ease = touring && phase === "read" ? 0.06 : 0.28;
      x = calm ? target : x + (target - x) * (1 - Math.exp(-dt / ease));
      if (Math.abs(target - x) < 0.01) x = target;
      // Feeler: a stiff spring riding the slugs and pins.
      const want = tipHeight(x);
      const stiff = 900;
      const drag = calm ? 2 * Math.sqrt(stiff) : 38;
      for (let i = 0; i < 4; i++) {
        tip.rate += (((want - tip.at) * stiff - tip.rate * drag) * dt) / 4;
        tip.at += (tip.rate * dt) / 4;
      }
      if (Math.abs(want - tip.at) < 0.005 && Math.abs(tip.rate) < 0.005) {
        tip.at = want;
        tip.rate = 0;
      }
      // Counter: advances one division per pin climbed; resets on the way home.
      const resetting = touring && phase === "return";
      const goal = resetting ? 0 : countAt(x).made;
      shown = calm ? goal : shown + (goal - shown) * (1 - Math.exp(-dt / 0.12));
      if (Math.abs(goal - shown) < 0.002) shown = goal;
      markShown = calm ? mark : markShown + (mark - markShown) * (1 - Math.exp(-dt / 0.25));
      if (Math.abs(mark - markShown) < 0.002) markShown = mark;
      draw();
      const settled = !touring && x === target && tip.rate === 0 && shown === goal && markShown === mark;
      frame = visible && !settled ? requestAnimationFrame(tick) : 0;
    };

    const run = () => {
      if (!frame && visible) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };
    const pause = () => {
      touring = false;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        touring = !still.matches;
        phase = "return";
        clock = 0;
        run();
      }, 4200);
    };
    const steer = (next: number) => {
      pause();
      target = Math.max(END, Math.min(START, next));
      run();
    };

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) run();
      },
      { rootMargin: "120px 0px" },
    );
    io.observe(root);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const box = el.getBoundingClientRect();
      const share = Math.min(1, Math.max(0, ((e.clientX - box.left) / box.width - 0.2) / 0.6));
      steer(START + (END - START) * share);
    };
    const onLeave = () => steer(target);
    const toggle = () => {
      statedIndex = (statedIndex + 1) % STATED.length;
      mark = STATED[statedIndex];
      pause();
      run();
    };
    const onKey = (e: KeyboardEvent) => {
      const step = (START - END) / (MAKES + 2);
      if (e.key === "ArrowRight") steer(target - step);
      else if (e.key === "ArrowLeft") steer(target + step);
      else if (e.key === "Home") steer(START);
      else if (e.key === "End") steer(END);
      else if (e.key === " " || e.key === "Enter") toggle();
      else return;
      e.preventDefault();
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("click", toggle);
    root.addEventListener("keydown", onKey);
    if (still.matches) {
      x = END;
      target = END;
      shown = countAt(END).made;
      tip.at = tipHeight(END);
    }
    draw();
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(idle);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("click", toggle);
      root.removeEventListener("keydown", onKey);
    };
  }, [P]);

  return (
    <figure className="iso iso-themed m-0">
      <div className="iso-plate card !rounded-[20px]">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">Fig 1</span>
          <span className="iso-plate-corner" data-corner="title">Stitch counter</span>
          <span className="iso-plate-corner hidden sm:inline" data-corner="hint">Hover · click</span>
          <span className="iso-plate-corner" data-corner="readout" ref={readout}>
            uses 0 of {USES} · makes 0 · pattern says {STATED[0]}
          </span>
        </div>
        <div
          ref={stage}
          className="iso-stage cursor-ew-resize"
          tabIndex={0}
          role="slider"
          aria-label="Stitch counter: arrow keys slide the row under the feeler; space changes the stated count"
          aria-valuemin={0}
          aria-valuemax={MAKES}
          aria-valuenow={0}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <figcaption className="iso-legend">
        <span className="iso-caption">
          One round of a hat crown, <span className="mono">*K2, k2tog; rep from * once more</span>, set as type. Each slug is as wide as the stitches it
          uses and carries one pin per stitch it makes; every pin the feeler climbs turns the dial one division. The marker holds the count the pattern
          states — here 6, then a typo&apos;d 7 — and the lamp shows whether the needle stops on it. Stitchproof&apos;s counter runs this same uses/makes
          table on every row of every size.
        </span>
      </figcaption>
    </figure>
  );
}
