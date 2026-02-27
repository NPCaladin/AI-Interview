import Link from 'next/link';
import {
  ArrowLeft,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Mic,
  MessageSquare,
  BarChart3,
  HelpCircle,
  Upload,
  Play,
  Volume2,
  Clock,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '사용 가이드 — EvenI 면접 연습',
  description: 'EvenI AI 면접 연습 앱 사용 방법 상세 안내',
};

/* ─── 공통 컴포넌트 ─── */
function SectionTitle({
  icon: Icon,
  title,
  color = 'text-[#00F2FF]',
  borderColor = 'border-[#00F2FF]/30',
  bgColor = 'bg-[#00F2FF]/10',
}: {
  icon: React.ElementType;
  title: string;
  color?: string;
  borderColor?: string;
  bgColor?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-8 h-8 rounded-lg ${bgColor} border ${borderColor} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <h2 className={`text-xl font-bold font-sans ${color}`}>{title}</h2>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-6 ${className}`}>
      {children}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-[#00F2FF]/5 border border-[#00F2FF]/20">
      <Info className="w-4 h-4 text-[#00F2FF] flex-shrink-0 mt-0.5" />
      <p className="text-xs text-[#00F2FF]/80 font-sans leading-relaxed">{children}</p>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
      <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-yellow-300/80 font-sans leading-relaxed">{children}</p>
    </div>
  );
}

export default function HowToUsePage() {
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

      <div className="relative max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* 돌아가기 */}
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
            <span className="text-xs font-tech text-[#00F2FF] tracking-[0.2em]">HOW TO USE</span>
            <div className="h-px flex-1 bg-gradient-to-l from-[#00F2FF]/50 to-transparent" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold font-sans text-center">
            <span className="text-white">앱 </span>
            <span className="text-[#00F2FF]">사용 가이드</span>
          </h1>
          <p className="text-center text-gray-400 mt-3 text-sm md:text-base font-sans">
            EvenI AI 면접 연습 앱을 처음부터 끝까지 100% 활용하는 방법
          </p>
        </div>

        {/* 빠른 목차 */}
        <div className="mb-10 p-5 rounded-xl border border-white/10 bg-white/[0.02]">
          <p className="text-xs font-tech text-[#00F2FF] tracking-widest mb-3">CONTENTS</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-sans text-gray-400">
            {[
              { n: '01', t: '로그인' },
              { n: '02', t: '화면 구성' },
              { n: '03', t: '면접 준비' },
              { n: '04', t: '마이크 테스트' },
              { n: '05', t: '면접 진행' },
              { n: '06', t: '답변 방법' },
              { n: '07', t: '분석 리포트' },
              { n: '08', t: '자주 묻는 질문' },
            ].map(({ n, t }) => (
              <div key={n} className="flex items-center gap-2">
                <span className="font-tech text-[#00F2FF]/60">{n}</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">

          {/* ─── 01 로그인 ─── */}
          <section>
            <SectionTitle icon={KeyRound} title="01 · 로그인 (수강생 인증)" />
            <Card>
              <p className="text-sm text-gray-300 font-sans leading-relaxed mb-5">
                EvenI 면접 연습은 <strong className="text-white">수강생 전용</strong> 서비스입니다.
                사이트에 처음 접속하면 코드 입력 화면이 나타납니다.
              </p>
              <div className="space-y-3">
                {[
                  { step: '1', desc: '강사 또는 운영진에게 발급받은 수강생 코드를 입력합니다. (예: STU-001, BETA-01)' },
                  { step: '2', desc: '"입장하기" 버튼을 누릅니다.' },
                  { step: '3', desc: '인증이 완료되면 면접 연습 화면으로 자동 이동합니다.' },
                ].map(({ step, desc }) => (
                  <div key={step} className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#00F2FF]/10 border border-[#00F2FF]/30 flex items-center justify-center">
                      <span className="text-[10px] font-tech text-[#00F2FF]">{step}</span>
                    </div>
                    <p className="text-sm text-gray-300 font-sans leading-relaxed pt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#00D9A5]/5 border border-[#00D9A5]/20">
                  <p className="text-xs font-semibold text-[#00D9A5] mb-1">주간 사용 횟수</p>
                  <p className="text-xs text-gray-400 font-sans">코드마다 주간 면접 가능 횟수가 정해져 있습니다. 사이드바 하단에서 잔여 횟수를 확인할 수 있습니다. 매주 월요일 자정에 초기화됩니다.</p>
                </div>
                <div className="p-3 rounded-lg bg-[#8b5cf6]/5 border border-[#8b5cf6]/20">
                  <p className="text-xs font-semibold text-[#8b5cf6] mb-1">세션 유지</p>
                  <p className="text-xs text-gray-400 font-sans">로그인 상태는 브라우저 탭을 닫아도 24시간 동안 유지됩니다. 로그아웃하려면 사이드바 하단 "로그아웃" 버튼을 누르세요.</p>
                </div>
              </div>
              <Warning>코드는 개인 전용입니다. 타인과 공유하지 마세요. 부정 사용 시 계정이 비활성화될 수 있습니다.</Warning>
            </Card>
          </section>

          {/* ─── 02 화면 구성 ─── */}
          <section>
            <SectionTitle icon={LayoutDashboard} title="02 · 화면 구성" color="text-purple-400" borderColor="border-purple-500/30" bgColor="bg-purple-500/10" />
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                {[
                  {
                    area: '왼쪽 · 사이드바',
                    color: 'border-[#00F2FF]/30 text-[#00F2FF]',
                    items: [
                      '직군 카테고리 선택 (사무/개발)',
                      '지원 직군·회사 선택',
                      '자소서 업로드 (선택)',
                      '마이크 테스트',
                      '주간 사용량 & 로그아웃',
                      '면접 시작 / 초기화 / 분석 버튼',
                    ],
                  },
                  {
                    area: '가운데 · 채팅 영역',
                    color: 'border-purple-500/30 text-purple-400',
                    items: [
                      'AI 면접관 정보 & 진행 단계 표시',
                      '질문 진행률 바 (0~100%)',
                      '면접관-지원자 대화 내역',
                      '면접 시작 전 안내 화면',
                    ],
                  },
                  {
                    area: '하단 · 입력 영역',
                    color: 'border-green-500/30 text-green-400',
                    items: [
                      '마이크 버튼 (음성 답변)',
                      '텍스트 입력창 (키보드 답변)',
                      '전송 버튼',
                      '면접 종료 시 입력 비활성화',
                    ],
                  },
                ].map(({ area, color, items }) => (
                  <div key={area} className={`p-4 rounded-lg border ${color.split(' ')[0]} bg-white/[0.02]`}>
                    <p className={`text-xs font-bold font-sans mb-3 ${color.split(' ')[1]}`}>{area}</p>
                    <ul className="space-y-1.5">
                      {items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-xs text-gray-400 font-sans">
                          <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Tip>모바일에서는 왼쪽 상단 햄버거 메뉴(☰)를 눌러 사이드바를 열 수 있습니다.</Tip>
            </Card>
          </section>

          {/* ─── 03 면접 준비 ─── */}
          <section>
            <SectionTitle icon={ListChecks} title="03 · 면접 준비" color="text-green-400" borderColor="border-green-500/30" bgColor="bg-green-500/10" />
            <Card>
              <p className="text-sm text-gray-300 font-sans leading-relaxed mb-5">
                면접 시작 전 사이드바에서 아래 항목을 설정하세요. 진행 인디케이터가 단계별 완료 여부를 표시합니다.
              </p>

              {/* STEP 1: 직군 카테고리 */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-tech text-[#00F2FF] bg-[#00F2FF]/10 border border-[#00F2FF]/30 px-2 py-0.5 rounded">STEP 1</span>
                  <span className="text-sm font-bold text-white font-sans">직군 카테고리 선택</span>
                </div>
                <div className="grid grid-cols-2 gap-3 ml-2">
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <p className="text-xs font-semibold text-white mb-1">사무직군</p>
                    <p className="text-xs text-gray-500 font-sans">게임기획 · 사업PM · 마케팅 · 운영 · QA · 데이터분석 · 개발PM · 서비스기획 · 전략기획 · 해외사업</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <p className="text-xs font-semibold text-white mb-1">개발직군</p>
                    <p className="text-xs text-gray-500 font-sans">프로그래머 · 엔지니어 · UI/UX · 애니메이션 · 사운드</p>
                  </div>
                </div>
              </div>

              {/* STEP 2: 직군 선택 */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-tech text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded">STEP 2</span>
                  <span className="text-sm font-bold text-white font-sans">지원 직군 선택</span>
                </div>
                <p className="text-xs text-gray-400 font-sans ml-2 leading-relaxed">
                  카테고리 선택 후 드롭다운에서 본인이 지원하는 직군을 정확하게 선택하세요. 선택한 직군에 맞는 전문 질문이 출제됩니다.
                </p>
              </div>

              {/* STEP 3: 회사 선택 */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-tech text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded">STEP 3</span>
                  <span className="text-sm font-bold text-white font-sans">지원 회사 선택</span>
                </div>
                <p className="text-xs text-gray-400 font-sans ml-2 leading-relaxed">
                  넥슨, 넷마블, 엔씨, 크래프톤 등 실제 지원 예정 회사를 선택하세요. 해당 회사의 특성을 반영한 질문 스타일로 면접이 진행됩니다.
                  특정 회사를 선택하지 않으려면 <strong className="text-white">공통(회사선택X)</strong>을 고르세요.
                </p>
              </div>

              {/* 자소서 업로드 */}
              <div className="p-4 rounded-xl border border-pink-500/20 bg-pink-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Upload className="w-4 h-4 text-pink-400" />
                  <span className="text-sm font-bold text-pink-400 font-sans">자소서 업로드 (선택 · 강력 권장)</span>
                </div>
                <p className="text-xs text-gray-400 font-sans leading-relaxed mb-3">
                  자기소개서를 업로드하면 AI 면접관이 자소서 내용을 바탕으로 <strong className="text-white">개인 맞춤 질문</strong>을 생성합니다. 실전과 가장 유사한 연습을 할 수 있습니다.
                </p>
                <ul className="space-y-1 text-xs text-gray-500 font-sans">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-400" /> 파일 형식: <strong className="text-gray-300">.txt (텍스트 파일)</strong></li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-400" /> 파일 크기: 1MB 이하</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-400" /> 텍스트 길이: 최대 10,000자 (초과 시 자동 잘림)</li>
                </ul>
                <Tip>한글(HWP)이나 Word 파일은 지원하지 않습니다. 메모장에 붙여넣어 .txt로 저장 후 업로드하세요.</Tip>
              </div>
            </Card>
          </section>

          {/* ─── 04 마이크 테스트 ─── */}
          <section>
            <SectionTitle icon={Mic} title="04 · 마이크 테스트" color="text-yellow-400" borderColor="border-yellow-500/30" bgColor="bg-yellow-500/10" />
            <Card>
              <p className="text-sm text-gray-300 font-sans leading-relaxed mb-5">
                음성 답변을 사용하기 전 반드시 마이크 테스트를 진행하세요. 사이드바 중간에 <strong className="text-white">마이크 테스트</strong> 섹션이 있습니다.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-white font-sans">테스트 방법</h3>
                  {[
                    '"테스트" 버튼 클릭 → 브라우저 마이크 권한 허용',
                    '말을 하면 5개의 막대가 움직입니다',
                    '소리가 잘 잡히면 "중지" 버튼으로 종료',
                  ].map((t, i) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-400 font-sans">
                      <span className="font-tech text-yellow-400 flex-shrink-0">{i + 1}.</span>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-white font-sans">막대 색상 의미</h3>
                  <div className="space-y-1.5 text-xs font-sans">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ background: '#8b5cf6' }} />
                      <span className="text-gray-400">보라 — 소리가 작습니다 (마이크를 가까이)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ background: '#00F2FF' }} />
                      <span className="text-gray-400">청록 — 적절한 음량입니다</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ background: '#00ff88' }} />
                      <span className="text-gray-400">초록 — 크고 명확한 음성입니다</span>
                    </div>
                  </div>
                </div>
              </div>
              <Warning>마이크 권한이 "차단"으로 설정된 경우 주소창 왼쪽 🔒 아이콘을 클릭해 마이크를 "허용"으로 변경하세요.</Warning>
            </Card>
          </section>

          {/* ─── 05 면접 진행 ─── */}
          <section>
            <SectionTitle icon={Play} title="05 · 면접 시작 & 진행" color="text-[#00D9A5]" borderColor="border-[#00D9A5]/30" bgColor="bg-[#00D9A5]/10" />
            <Card>
              {/* 시작 조건 */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-white font-sans mb-3">면접 시작 조건</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { label: '직군 선택', required: true },
                    { label: '회사 선택', required: true },
                    { label: '자소서 업로드', required: false },
                  ].map(({ label, required }) => (
                    <div key={label} className={`flex items-center gap-2 p-3 rounded-lg ${required ? 'bg-[#00F2FF]/5 border border-[#00F2FF]/20' : 'bg-white/[0.02] border border-white/5'}`}>
                      <CheckCircle2 className={`w-4 h-4 ${required ? 'text-[#00F2FF]' : 'text-gray-500'}`} />
                      <div>
                        <p className="text-xs text-white font-sans">{label}</p>
                        <p className="text-[10px] text-gray-500 font-sans">{required ? '필수' : '선택'}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 font-sans mt-3">직군과 회사를 모두 선택해야 <strong className="text-white">면접 시작</strong> 버튼이 활성화됩니다.</p>
              </div>

              {/* 면접 4단계 */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-white font-sans mb-3">면접 진행 단계 (총 12문항)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { phase: '도입부', q: '1~2번', desc: '자기소개, 지원 동기' },
                    { phase: '직무 면접', q: '3~8번', desc: '직군별 전문 역량, 기술 질문' },
                    { phase: '인성 면접', q: '9~11번', desc: '협업, 문제 해결, 태도' },
                    { phase: '마무리', q: '12번', desc: '역질문, 포부' },
                  ].map(({ phase, q, desc }) => (
                    <div key={phase} className="p-3 rounded-lg bg-white/[0.03] border border-white/10 text-center">
                      <p className="text-xs font-tech text-[#00F2FF] mb-1">{q}</p>
                      <p className="text-sm font-bold text-white font-sans mb-1">{phase}</p>
                      <p className="text-[11px] text-gray-500 font-sans">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 진행 중 UI */}
              <div className="mb-5">
                <h3 className="text-sm font-bold text-white font-sans mb-3">진행 중 화면 안내</h3>
                <div className="space-y-2 text-xs text-gray-400 font-sans">
                  {[
                    { label: '진행률 바', desc: '상단에 현재 질문 번호와 % 진행률이 표시됩니다.' },
                    { label: 'LIVE 배지', desc: '면접이 진행 중일 때 상단 오른쪽에 LIVE 표시가 깜빡입니다.' },
                    { label: '면접관 음성', desc: '각 질문은 AI 면접관의 목소리로 자동 재생됩니다.' },
                    { label: '꼬리질문', desc: '답변에 따라 면접관이 추가 질문을 할 수 있습니다. 이는 정상적인 진행입니다.' },
                  ].map(({ label, desc }) => (
                    <div key={label} className="flex gap-3 p-2.5 rounded-lg bg-white/[0.02]">
                      <span className="font-semibold text-white flex-shrink-0 w-24">{label}</span>
                      <span>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 타임아웃 */}
              <div className="p-4 rounded-xl border border-orange-500/20 bg-orange-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-bold text-orange-400 font-sans">무응답 타임아웃</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-400 font-sans">
                  <div className="flex gap-2">
                    <span className="font-tech text-yellow-400 flex-shrink-0">3분</span>
                    <span>무응답 시 경고 팝업이 나타납니다. "계속하기"를 누르면 면접을 이어갈 수 있습니다.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-tech text-red-400 flex-shrink-0">4분</span>
                    <span>무응답이 지속되면 면접이 자동으로 종료됩니다. 팝업에서 "지금 분석하기"를 선택하면 즉시 리포트를 받을 수 있습니다.</span>
                  </div>
                </div>
              </div>

              <Tip>면접은 12문항이 모두 끝나야 완료됩니다. 도중에 초기화 버튼을 누르면 모든 대화가 삭제되고 처음부터 다시 시작합니다.</Tip>
            </Card>
          </section>

          {/* ─── 06 답변 방법 ─── */}
          <section>
            <SectionTitle icon={MessageSquare} title="06 · 답변 방법" color="text-[#8b5cf6]" borderColor="border-[#8b5cf6]/30" bgColor="bg-[#8b5cf6]/10" />
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 음성 답변 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Mic className="w-5 h-5 text-[#00F2FF]" />
                    <h3 className="text-sm font-bold text-white font-sans">음성 답변 (권장)</h3>
                  </div>
                  <ol className="space-y-2.5">
                    {[
                      { n: '1', t: '하단 마이크 버튼(🎤)을 클릭합니다.' },
                      { n: '2', t: '버튼이 빨간색으로 바뀌고 녹음이 시작됩니다. 또렷하게 답변하세요.' },
                      { n: '3', t: '답변이 끝나면 마이크 버튼을 다시 클릭해 녹음을 종료합니다.' },
                      { n: '4', t: 'AI가 음성을 텍스트로 변환한 뒤 자동 전송됩니다.' },
                    ].map(({ n, t }) => (
                      <li key={n} className="flex gap-3 text-xs text-gray-400 font-sans">
                        <span className="font-tech text-[#00F2FF] flex-shrink-0">{n}.</span>
                        <span className="leading-relaxed">{t}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3 p-3 rounded-lg bg-[#00F2FF]/5 border border-[#00F2FF]/15 space-y-1.5 text-xs text-gray-400 font-sans">
                    <p className="font-semibold text-[#00F2FF]">음성 답변 팁</p>
                    <p>· 조용한 환경에서 마이크와 15~30cm 거리를 유지하세요.</p>
                    <p>· 한 번에 너무 길게 말하기보다 2~3분 내로 핵심을 전달하세요.</p>
                    <p>· &ldquo;어&rdquo;, &ldquo;음&rdquo; 같은 필러 단어를 줄이면 분석 점수에 유리합니다.</p>
                  </div>
                </div>

                {/* 텍스트 답변 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="w-5 h-5 text-[#8b5cf6]" />
                    <h3 className="text-sm font-bold text-white font-sans">텍스트 답변</h3>
                  </div>
                  <ol className="space-y-2.5">
                    {[
                      { n: '1', t: '하단 입력창에 키보드로 답변을 작성합니다.' },
                      { n: '2', t: 'Enter 키 또는 전송 버튼(→)으로 전송합니다.' },
                      { n: '3', t: 'Shift + Enter로 줄바꿈할 수 있습니다.' },
                    ].map(({ n, t }) => (
                      <li key={n} className="flex gap-3 text-xs text-gray-400 font-sans">
                        <span className="font-tech text-[#8b5cf6] flex-shrink-0">{n}.</span>
                        <span className="leading-relaxed">{t}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3 p-3 rounded-lg bg-[#8b5cf6]/5 border border-[#8b5cf6]/15 text-xs text-gray-400 font-sans space-y-1.5">
                    <p className="font-semibold text-[#8b5cf6]">입력 제한</p>
                    <p>· 최대 2,000자까지 입력 가능합니다.</p>
                    <p>· 음성과 텍스트를 번갈아 사용할 수 있습니다.</p>
                  </div>

                  {/* 음성 재생 실패 안내 */}
                  <div className="mt-4 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Volume2 className="w-3.5 h-3.5 text-yellow-400" />
                      <p className="text-xs font-semibold text-yellow-400 font-sans">면접관 음성이 안 들릴 때</p>
                    </div>
                    <p className="text-xs text-gray-400 font-sans leading-relaxed">
                      브라우저 자동재생 정책으로 음성이 막힐 수 있습니다. 화면 하단에 <strong className="text-white">"면접관 음성 재생"</strong> 버튼이 나타나면 클릭하세요.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* ─── 07 분석 리포트 ─── */}
          <section>
            <SectionTitle icon={BarChart3} title="07 · 분석 리포트" color="text-[#f59e0b]" borderColor="border-[#f59e0b]/30" bgColor="bg-[#f59e0b]/10" />
            <Card>
              <p className="text-sm text-gray-300 font-sans leading-relaxed mb-5">
                면접이 끝나면 사이드바의 <strong className="text-white">종료 후 분석</strong> 버튼이 활성화됩니다.
                (최소 5문항 이상 답변 후 활성화)
                클릭하면 AI가 전체 대화를 분석하며, 결과가 스트리밍 방식으로 실시간 표시됩니다.
              </p>

              {/* 리포트 구성 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                {[
                  {
                    title: '역량별 점수 (5개 항목)',
                    color: 'text-[#00F2FF]',
                    items: ['직무 적합도 (25%)', '논리성 (20%)', '게임 센스 (25%)', '태도 (15%)', '소통 능력 (15%)'],
                  },
                  {
                    title: 'STAR 기법 달성도',
                    color: 'text-yellow-400',
                    items: ['S(상황) · T(과제) · A(행동) · R(결과) 각 항목 평가', '답변별 구조 분석', '미흡한 항목 개선 가이드'],
                  },
                  {
                    title: '종합 피드백',
                    color: 'text-green-400',
                    items: ['강점 요약', '개선 필요 포인트', '다음 면접을 위한 구체적 조언'],
                  },
                  {
                    title: '합격 예측',
                    color: 'text-purple-400',
                    items: ['80점 이상 → 합격', '65~79점 → 합격 보류 (B+)', '65점 미만 → 불합격', '예측 근거 설명 포함'],
                  },
                ].map(({ title, color, items }) => (
                  <div key={title} className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
                    <h3 className={`text-xs font-bold font-sans mb-2 ${color}`}>{title}</h3>
                    <ul className="space-y-1">
                      {items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-xs text-gray-400 font-sans">
                          <span className={`mt-1 w-1 h-1 rounded-full flex-shrink-0 bg-current ${color}`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <Tip>분석 결과를 최대한 활용하려면 각 항목의 "개선 포인트"를 메모하고, 다음 면접에서 집중적으로 보완하세요. 반복 연습이 가장 효과적입니다.</Tip>
              <Warning>분석 중에는 브라우저를 닫거나 페이지를 이탈하지 마세요. 분석이 중단되면 "다시 분석" 버튼으로 재시도할 수 있습니다.</Warning>
            </Card>
          </section>

          {/* ─── 08 FAQ ─── */}
          <section>
            <SectionTitle icon={HelpCircle} title="08 · 자주 묻는 질문" color="text-red-400" borderColor="border-red-500/30" bgColor="bg-red-500/10" />
            <Card>
              <div className="space-y-4">
                {[
                  {
                    q: '음성 답변 버튼을 눌렀는데 마이크가 작동하지 않아요.',
                    a: '브라우저 주소창 왼쪽 🔒 아이콘 → 마이크 권한을 "허용"으로 변경 후 페이지를 새로고침하세요. 사이드바 마이크 테스트로 작동 여부를 미리 확인할 수 있습니다.',
                  },
                  {
                    q: '면접관 목소리가 들리지 않아요.',
                    a: '브라우저 자동재생 차단 정책 때문일 수 있습니다. 화면 하단에 나타나는 "면접관 음성 재생" 버튼을 눌러 수동으로 재생하세요. 또는 기기 볼륨과 브라우저 탭 음소거 상태를 확인하세요.',
                  },
                  {
                    q: '"면접 시작" 버튼이 비활성화되어 있어요.',
                    a: '직군과 회사를 모두 선택해야 버튼이 활성화됩니다. 사이드바에서 두 항목이 모두 선택됐는지 확인하세요.',
                  },
                  {
                    q: '"이번 주 면접 횟수를 모두 사용했습니다"라고 뜨는데요.',
                    a: '주간 사용 가능 횟수를 초과한 상태입니다. 매주 월요일에 자동으로 초기화됩니다. 긴급한 경우 강사에게 문의해 횟수 증가를 요청하세요.',
                  },
                  {
                    q: '자소서 파일 업로드가 안 되는데 어떤 파일 형식을 써야 하나요?',
                    a: '.txt (텍스트 파일)만 지원됩니다. HWP나 Word 파일의 내용을 복사해 메모장(Windows) 또는 텍스트 편집기(Mac)에 붙여넣고 .txt로 저장하세요.',
                  },
                  {
                    q: '"종료 후 분석" 버튼이 비활성화되어 있어요.',
                    a: '최소 5개 질문에 답변해야 활성화됩니다. 면접이 완전히 종료(12문항)되거나, 5문항 이상 진행된 상태에서도 초기화 없이 분석할 수 있습니다.',
                  },
                  {
                    q: '면접 도중 실수로 초기화 버튼을 눌렀어요.',
                    a: '초기화 버튼을 누르면 모든 대화 내역이 삭제됩니다. 복구 방법은 없으니 주의하세요. 초기화는 분석 리포트를 받은 후 새 면접을 시작할 때만 사용하는 것을 권장합니다.',
                  },
                  {
                    q: '분석 도중 페이지가 닫혔어요.',
                    a: '분석이 중단된 경우 페이지를 다시 열면 "다시 분석" 버튼이 표시됩니다. 해당 버튼을 눌러 분석을 재시도하세요.',
                  },
                ].map(({ q, a }) => (
                  <div key={q} className="p-4 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-xs font-tech text-red-400 font-bold flex-shrink-0 mt-0.5">Q.</span>
                      <p className="text-sm font-semibold text-white font-sans">{q}</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-tech text-[#00D9A5] font-bold flex-shrink-0 mt-0.5">A.</span>
                      <p className="text-sm text-gray-400 font-sans leading-relaxed">{a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>

        </div>

        {/* 하단 CTA */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-[#00F2FF]/10 border border-[#00F2FF]/40 text-[#00F2FF] font-sans font-medium text-sm hover:bg-[#00F2FF]/20 transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,242,255,0.2)]"
          >
            면접 연습 시작하기
          </Link>
          <Link
            href="/guide"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-sans font-medium text-sm hover:bg-white/10 hover:text-white transition-all duration-300"
          >
            면접 가이드 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
