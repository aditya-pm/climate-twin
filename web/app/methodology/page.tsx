import type { Metadata } from "next";
import Methodology from "@/components/methodology/Methodology";

export const metadata: Metadata = { title: "Methodology — ClimateTwin" };

export default function Page() {
  return <Methodology />;
}
