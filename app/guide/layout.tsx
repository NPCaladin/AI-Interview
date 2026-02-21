import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '면접 가이드 | EvenI',
  description: 'EvenI 게임 업계 면접 연습 가이드. STAR 기법, 직무별 핵심 팁, 자주 하는 실수 안내.',
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
