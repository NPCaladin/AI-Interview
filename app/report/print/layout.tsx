import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '면접 결과 리포트 | 이븐아이',
  robots: { index: false },
};

export default function ReportPrintLayout({ children }: { children: React.ReactNode }) {
  return children;
}
