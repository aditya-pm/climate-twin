import type { Metadata } from "next";
import Insights from "@/components/insights/Insights";

export const metadata: Metadata = { title: "Insights — ClimateTwin" };

export default function Page() {
  return <Insights />;
}
