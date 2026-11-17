import type { Metadata } from "next";
import { Instrument_Serif, Inter_Tight, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

const body = Manrope({ variable: "--font-sans-body", subsets: ["latin"] });
const display = Inter_Tight({ variable: "--font-display", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const mono = JetBrains_Mono({ variable: "--font-mono-num", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ClimateTwin — Urban heat digital twin for Chennai",
  description:
    "AI-powered urban climate vulnerability and mitigation simulator. Explore heat risk across Chennai, understand its drivers, and test interventions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${serif.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
