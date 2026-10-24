import type { Metadata } from "next";
import { KnitView } from "@/components/KnitView";

export const metadata: Metadata = { title: "Knit mode" };

export default async function KnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnitView id={id} />;
}
