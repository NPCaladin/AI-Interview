import type { Metadata, Viewport } from "next";
import { Orbitron } from "next/font/google";
import "./globals.css";
import { DevModeProvider } from "@/contexts/DevModeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "sonner";

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "EvenI 면접 연습",
  description: "게임 업계 AI 모의 면접 플랫폼. 직무별 맞춤 질문, STAR 기법 분석, 실시간 피드백.",
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: "EvenI 면접 연습",
    description: "게임 업계 AI 모의 면접 플랫폼",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={orbitron.variable}>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css" />
      </head>
      <body>
        <AuthProvider>
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
        </AuthProvider>
      </body>
    </html>
  );
}
