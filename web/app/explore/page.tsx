import type { Metadata } from "next";
import Explorer from "@/components/explorer/Explorer";

export const metadata: Metadata = { title: "Twin Explorer — ClimateTwin" };

export default function Page() {
  return <Explorer />;
}
