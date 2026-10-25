import type { Metadata } from "next";
import { PatternList } from "@/components/PatternList";

export const metadata: Metadata = { title: "My patterns" };

export default function PatternsPage() {
  return (
    <div className="mx-auto max-w-[960px] px-4 pt-10 pb-20 sm:px-6">
      <div className="mb-8">
        <h1 className="text-[30px] font-semibold tracking-[-0.03em]">My patterns</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">Saved in this browser only. Nothing is stored on a server.</p>
      </div>
      <PatternList />
    </div>
  );
}
