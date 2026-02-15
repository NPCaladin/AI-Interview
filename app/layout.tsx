import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import "./globals.css";
import { DevModeProvider } from "@/contexts/DevModeContext";
import { Toaster } from "sonner";

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
        <DevModeProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: 'rgba(30, 30, 45, 0.95)',
                border: '1px solid rgba(0, 242, 255, 0.3)',
                color: '#e5e5e5',
                backdropFilter: 'blur(12px)',
              },
            }}
          />
        </DevModeProvider>
      </body>
    </html>
  );
}
