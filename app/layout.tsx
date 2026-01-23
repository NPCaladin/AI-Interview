import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import "./globals.css";
import { DevModeProvider } from "@/contexts/DevModeContext";

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ENENI Interview Training",
  description: "AI-Powered Mock Interview for Game Industry",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={orbitron.variable}>
      <body>
        <DevModeProvider>{children}</DevModeProvider>
      </body>
    </html>
  );
}
