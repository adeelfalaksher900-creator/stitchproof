import { buildMachine } from "@/lib/figure/machine";
import { CountingMachineLive } from "./CountingMachineLive";

/** Server component: builds the figure's static SVG once, then hands it to the live part. */
export function CountingMachine() {
  const { svg, P } = buildMachine();
  return <CountingMachineLive svg={svg} P={P} />;
}
