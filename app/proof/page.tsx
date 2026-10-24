import type { Metadata } from "next";
import { Suspense } from "react";
import { ProofWorkspace } from "@/components/ProofWorkspace";

export const metadata: Metadata = {
  title: "Proof a pattern",
  description: "Paste a knitting pattern and prove every row's stitch count in every size.",
};

export default function ProofPage() {
  return (
    <Suspense>
      <ProofWorkspace />
    </Suspense>
  );
}
