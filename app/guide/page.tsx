import Link from 'next/link';
import { ArrowLeft, Monitor, Star, Lightbulb, AlertTriangle } from 'lucide-react';

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-white">
      {/* 배경 그리드 */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,242,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,242,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* 돌아가기 링크 */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-sans text-gray-400 hover:text-[#00F2FF] transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          면접으로 돌아가기
        </Link>

        {/* 페이지 헤더 */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 bg-gradient-to-r from-[#00F2FF]/50 to-transparent" />
            {/* 영문 배지 → font-tech */}
            <span className="text-xs font-tech text-[#00F2FF] tracking-[0.2em]">INTERVIEW GUIDE</span>
            <div className="h-px flex-1 bg-gradient-to-l from-[#00F2FF]/50 to-transparent" />
          </div>
          {/* 한국어 제목 → font-sans */}
          <h1 className="text-3xl md:text-4xl font-bold font-sans text-center">
            <span className="text-white">면접 </span>
            <span className="text-[#00F2FF]">가이드</span>
          </h1>
          <p className="text-center text-gray-400 mt-3 text-sm md:text-base font-sans">
            EvenI 면접 연습 시스템을 최대한 활용하는 방법을 안내합니다.
          </p>
        </div>

        {/* 섹션 1: 시스템 사용법 */}
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#00F2FF]/10 border border-[#00F2FF]/30 flex items-center justify-center">
              <Monitor className="w-4 h-4 text-[#00F2FF]" />
            </div>
            {/* 한국어 섹션 제목 → font-sans */}
            <h2 className="text-xl font-bold font-sans text-[#00F2FF]">시스템 사용법</h2>
          </div>
          <div className="rounded-xl border border-[#00F2FF]/20 bg-white/[0.03] p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { step: '01', title: '직군 선택', desc: '사이드바에서 면접 볼 직군을 선택합니다. 자소서를 업로드하면 맞춤 질문을 받을 수 있습니다.' },
                { step: '02', title: '면접 시작', desc: '"면접 시작" 버튼을 누르면 AI 면접관이 첫 질문을 합니다. 준비가 되면 바로 답변하세요.' },
                { step: '03', title: '음성 답변', desc: '마이크 버튼을 눌러 음성으로 답변하거나, 텍스트로 직접 입력할 수 있습니다.' },
                { step: '04', title: '분석 리포트', desc: '12개 질문이 끝나면 STAR 기법 달성도, 역량별 평가, 개선 포인트가 담긴 리포트를 받습니다.' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-4 p-4 rounded-lg bg-white/[0.03] border border-white/5">
                  {/* 숫자 배지 → font-tech */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#00F2FF]/10 border border-[#00F2FF]/30 flex items-center justify-center font-tech text-xs font-bold text-[#00F2FF]">
                    {step}
                  </div>
                  <div>
                    <h3 className="font-semibold font-sans text-white text-sm mb-1">{title}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed font-sans">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 섹션 2: STAR 기법 */}
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
              <Star className="w-4 h-4 text-yellow-400" />
            </div>
            {/* "STAR"은 영문 약어 → font-tech */}
            <h2 className="text-xl font-bold font-tech text-yellow-400">STAR 기법</h2>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-white/[0.03] p-6">
            <p className="text-sm text-gray-300 mb-5 leading-relaxed font-sans">
              STAR 기법은 경험 기반 답변의 핵심 구조입니다. 면접관은 이 구조를 바탕으로 여러분의 역량을 평가합니다.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  letter: 'S',
                  word: 'Situation',
                  color: 'text-blue-400',
                  border: 'border-blue-500/30',
                  bg: 'bg-blue-500/10',
                  title: '상황 설명',
                  desc: '어떤 배경과 맥락에서 일어난 일인가요?',
                  example: '예: "3학년 1학기 팀 프로젝트에서 개발 팀장을 맡았을 때..."',
                },
                {
                  letter: 'T',
                  word: 'Task',
                  color: 'text-purple-400',
                  border: 'border-purple-500/30',
                  bg: 'bg-purple-500/10',
                  title: '맡은 과제',
                  desc: '그 상황에서 나의 역할과 해야 할 일은 무엇이었나요?',
                  example: '예: "일정 내 핵심 기능 3가지를 구현해야 했고..."',
                },
                {
                  letter: 'A',
                  word: 'Action',
                  color: 'text-green-400',
                  border: 'border-green-500/30',
                  bg: 'bg-green-500/10',
                  title: '취한 행동',
                  desc: '문제 해결을 위해 구체적으로 어떤 행동을 했나요?',
                  example: '예: "매일 스탠드업 미팅을 도입하고, 리스크 기능을 먼저 개발하도록 순서를 조정했습니다."',
                },
                {
                  letter: 'R',
                  word: 'Result',
                  color: 'text-yellow-400',
                  border: 'border-yellow-500/30',
                  bg: 'bg-yellow-500/10',
                  title: '결과',
                  desc: '그 행동의 결과는 무엇이었나요? 수치로 표현하면 더 좋습니다.',
                  example: '예: "일정보다 2일 앞서 완료하여 A+ 학점을 받았고, 팀원들로부터 리더십을 인정받았습니다."',
                },
              ].map(({ letter, word, color, border, bg, title, desc, example }) => (
                <div key={letter} className={`p-4 rounded-lg border ${border} ${bg}`}>
                  <div className="flex items-center gap-3 mb-2">
                    {/* STAR 알파벳·영문명 → font-tech */}
                    <span className={`text-2xl font-black font-tech ${color}`}>{letter}</span>
                    <div>
                      <span className={`text-xs font-tech font-bold ${color}`}>{word}</span>
                      <p className="text-xs text-white font-sans font-medium">{title}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-300 mb-2 font-sans">{desc}</p>
                  <p className="text-xs text-gray-500 italic font-sans">{example}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 섹션 3: 게임 업계 면접 팁 */}
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-green-400" />
            </div>
            <h2 className="text-xl font-bold font-sans text-green-400">게임 업계 면접 팁</h2>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-white/[0.03] p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  job: '게임 기획',
                  color: 'text-[#00F2FF]',
                  border: 'border-[#00F2FF]/20',
                  tips: [
                    '본인이 기획한 콘텐츠의 재미 요소를 구체적으로 설명',
                    '플레이어 경험(UX) 관점에서 설계 의도 서술',
                    '데이터와 유저 피드백을 기반으로 개선한 경험 강조',
                  ],
                },
                {
                  job: '게임 프로그래밍',
                  color: 'text-purple-400',
                  border: 'border-purple-500/20',
                  tips: [
                    '사용한 엔진(Unity/Unreal)과 언어, 구체적 역할 명시',
                    '성능 최적화 또는 버그 해결 경험을 수치와 함께 제시',
                    '협업 시 코드 리뷰, 버전 관리 경험 언급',
                  ],
                },
                {
                  job: '게임 아트',
                  color: 'text-pink-400',
                  border: 'border-pink-500/20',
                  tips: [
                    '작업물 포트폴리오의 제작 의도와 과정 설명 준비',
                    '게임 세계관 및 아트 디렉션에 맞춘 스타일 결정 과정',
                    '사용 툴(Maya, Blender, Photoshop 등)과 워크플로우 설명',
                  ],
                },
                {
                  job: 'QA / 경영지원',
                  color: 'text-orange-400',
                  border: 'border-orange-500/20',
                  tips: [
                    '발견한 버그의 심각도 분류 및 재현 절차 기록 경험',
                    '경영지원: 다부서 협업 프로세스 개선 경험',
                    '게임에 대한 이해도와 애정을 구체적 플레이 경험으로 표현',
                  ],
                },
                {
                  job: '사업',
                  color: 'text-emerald-400',
                  border: 'border-emerald-500/20',
                  tips: [
                    '파트너십·퍼블리싱 계약 등 협상 경험을 구체적 성과로 제시',
                    '매출 목표 설정 및 달성 과정, 수치 기반 성과 서술',
                    '글로벌 시장 진출 또는 신규 사업 기회 발굴 경험 강조',
                  ],
                },
                {
                  job: '마케팅',
                  color: 'text-rose-400',
                  border: 'border-rose-500/20',
                  tips: [
                    '캠페인 기획부터 실행·분석까지 전 과정 서술',
                    '유저 획득(UA) 지표(CPI, ROAS 등) 개선 경험 수치화',
                    'SNS·인플루언서·커뮤니티 채널별 전략 차별화 경험',
                  ],
                },
                {
                  job: '운영',
                  color: 'text-sky-400',
                  border: 'border-sky-500/20',
                  tips: [
                    '라이브 서비스 이슈 대응 및 사후 처리 프로세스 설명',
                    'DAU·리텐션 등 핵심 지표 모니터링 및 개선 경험',
                    'CS·커뮤니티 관리에서 유저 신뢰 회복 사례 강조',
                  ],
                },
                {
                  job: '개발 PM',
                  color: 'text-violet-400',
                  border: 'border-violet-500/20',
                  tips: [
                    '개발 일정 산정·리스크 관리 경험을 프로젝트 규모와 함께 제시',
                    '기획·개발·QA 간 스펙 조율 및 의사결정 과정 서술',
                    '애자일/스크럼 방법론 적용 경험과 회고 개선 사례',
                  ],
                },
                {
                  job: '데이터 분석',
                  color: 'text-amber-400',
                  border: 'border-amber-500/20',
                  tips: [
                    'SQL·BI 툴(Tableau, Looker 등) 활용 분석 경험 구체화',
                    'A/B 테스트 설계부터 결과 해석·의사결정 기여까지 서술',
                    '지표 정의(KPI 설계) 및 데이터 기반 제품 개선 사례 강조',
                  ],
                },
              ].map(({ job, color, border, tips }) => (
                <div key={job} className={`p-4 rounded-lg border ${border} bg-white/[0.02]`}>
                  {/* 직군명 → font-sans (한국어) */}
                  <h3 className={`font-bold font-sans text-sm ${color} mb-3`}>{job}</h3>
                  <ul className="space-y-1.5">
                    {tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-300 font-sans">
                        <span className={`mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-current ${color}`} />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 섹션 4: 자주 하는 실수 */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <h2 className="text-xl font-bold font-sans text-red-400">자주 하는 실수</h2>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-white/[0.03] p-6">
            <div className="space-y-3">
              {[
                {
                  title: '두루뭉술한 답변',
                  bad: '"열심히 했습니다", "최선을 다했습니다"',
                  good: '"매주 3시간씩 추가 스터디를 진행해 2주 만에 해결했습니다"',
                },
                {
                  title: '결과 누락',
                  bad: '행동만 설명하고 결과를 빠뜨리는 경우',
                  good: '반드시 그 행동이 가져온 구체적 성과나 배운 점으로 마무리',
                },
                {
                  title: '너무 긴 답변',
                  bad: '5분 이상 장황하게 이야기하는 경우',
                  good: 'STAR 구조로 2~3분 내 핵심만 전달, 면접관 질문에 집중',
                },
                {
                  title: '팀 성과를 개인 성과처럼 표현',
                  bad: '"저희 팀이 전부 다 같이..."라고 뭉뚱그리는 경우',
                  good: '"팀 프로젝트에서 제가 담당한 부분은..." 명확히 구분',
                },
              ].map(({ title, bad, good }) => (
                <div key={title} className="flex gap-4 p-4 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex-shrink-0 w-1 rounded-full bg-red-500/50" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold font-sans text-sm text-white mb-2">{title}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-sans">
                      <div className="flex items-start gap-2 text-red-400/80">
                        <span className="flex-shrink-0 font-bold">✗</span>
                        <span>{bad}</span>
                      </div>
                      <div className="flex items-start gap-2 text-green-400/80">
                        <span className="flex-shrink-0 font-bold">✓</span>
                        <span>{good}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 하단 CTA */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-[#00F2FF]/10 border border-[#00F2FF]/40 text-[#00F2FF] font-sans font-medium text-sm hover:bg-[#00F2FF]/20 transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,242,255,0.2)]"
          >
            면접 연습 시작하기
          </Link>
        </div>
      </div>
    </div>
  );
}
