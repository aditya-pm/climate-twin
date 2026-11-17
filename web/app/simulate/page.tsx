import type { Metadata } from "next";
import Simulator from "@/components/simulator/Simulator";

export const metadata: Metadata = { title: "What-If Simulator — ClimateTwin" };

export default function Page() {
  return <Simulator />;
}
