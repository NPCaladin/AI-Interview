'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Briefcase,
  Building2,
  Settings,
  ChevronDown,
  ChevronUp,
  Mic,
  Play,
  RotateCcw,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Bug,
  Gamepad2,
  Target,
  Upload,
  Zap,
  Crosshair,
  Shield,
  Cpu,
  Radio,
  Lock,
  Unlock,
  X,
} from 'lucide-react';
import { 사무직군, 개발직군, COMPANY_LIST } from '@/lib/constants';
import { useDevMode } from '@/contexts/DevModeContext';
import { PROMPT_PRESETS } from '@/lib/prompts';

interface SidebarProps {
  onStartInterview?: () => void;
  onReset?: () => void;
  onAnalyze?: () => void;
  isInterviewStarted?: boolean;
  selectedJob?: string;
  selectedCompany?: string;
  onJobChange?: (job: string) => void;
  onCompanyChange?: (company: string) => void;
  sttModel?: 'OpenAI Whisper' | 'Daglo';
  onSttModelChange?: (model: 'OpenAI Whisper' | 'Daglo') => void;
  questionCount?: number;
  canAnalyze?: boolean;
  isAnalyzing?: boolean;
  onResumeUpload?: (text: string) => void;
  // 모바일 드로어
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

// 데이터 스트림 애니메이션 컴포넌트
function DataStream() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
      <div className="data-stream-line" style={{ left: '10%', animationDelay: '0s' }} />
      <div className="data-stream-line" style={{ left: '30%', animationDelay: '0.5s' }} />
      <div className="data-stream-line" style={{ left: '50%', animationDelay: '1s' }} />
      <div className="data-stream-line" style={{ left: '70%', animationDelay: '1.5s' }} />
      <div className="data-stream-line" style={{ left: '90%', animationDelay: '2s' }} />
    </div>
  );
}

// 섹션 헤더 컴포넌트
function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  status,
  glowColor = 'cyan'
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  status?: 'locked' | 'active' | 'complete';
  glowColor?: 'cyan' | 'purple' | 'green' | 'pink';
}) {
  const colorMap = {
    cyan: { text: 'text-[#00F2FF]', glow: 'drop-shadow-[0_0_8px_rgba(0,242,255,0.9)]', bg: 'bg-[#00F2FF]/10' },
    purple: { text: 'text-[#8b5cf6]', glow: 'drop-shadow-[0_0_8px_rgba(139,92,246,0.9)]', bg: 'bg-[#8b5cf6]/10' },
    green: { text: 'text-[#00ff88]', glow: 'drop-shadow-[0_0_8px_rgba(0,255,136,0.9)]', bg: 'bg-[#00ff88]/10' },
    pink: { text: 'text-[#ff00a8]', glow: 'drop-shadow-[0_0_8px_rgba(255,0,168,0.9)]', bg: 'bg-[#ff00a8]/10' },
  };
  const colors = colorMap[glowColor];

  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`relative p-2.5 rounded-lg ${colors.bg} border border-white/10`}>
        <Icon className={`w-4 h-4 ${colors.text} ${colors.glow}`} />
        {status === 'complete' && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#00ff88] rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-2 h-2 text-dark-900" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white truncate">{title}</h3>
          {status === 'locked' && <Lock className="w-3 h-3 text-gray-500" />}
        </div>
        <p className="text-[10px] font-mono text-gray-500 tracking-wider uppercase">{subtitle}</p>
      </div>
    </div>
  );
}

// 진행 스텝 인디케이터
function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div key={i} className="flex-1 flex items-center gap-1">
          <div
            className={`h-1 flex-1 rounded-full transition-all duration-500 ${
              i < currentStep
                ? 'bg-gradient-to-r from-[#00F2FF] to-[#8b5cf6] shadow-[0_0_10px_rgba(0,242,255,0.5)]'
                : i === currentStep
                ? 'bg-[#00F2FF]/50 animate-pulse'
                : 'bg-dark-600'
            }`}
          />
          {i < totalSteps - 1 && (
            <Crosshair
              className={`w-2.5 h-2.5 flex-shrink-0 ${
                i < currentStep ? 'text-[#00ff88]' : 'text-dark-500'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// 선택 칩 버튼
function SelectionChip({
  selected,
  onClick,
  children,
  disabled = false
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-300
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${selected
          ? 'bg-gradient-to-br from-[#00F2FF]/20 to-[#8b5cf6]/20 text-white border border-[#00F2FF]/60 shadow-[0_0_20px_rgba(0,242,255,0.3),inset_0_0_20px_rgba(0,242,255,0.1)]'
          : 'bg-dark-700/80 text-gray-400 border border-dark-500 hover:border-[#00F2FF]/30 hover:text-gray-200 hover:bg-dark-600/80'
        }
      `}
    >
      {selected && (
        <div className="absolute inset-0 rounded-lg overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
        </div>
      )}
      <span className="relative z-10 flex items-center gap-2">
        {selected && <Radio className="w-3 h-3 text-[#00F2FF] animate-pulse" />}
        {children}
      </span>
    </button>
  );
}

// 커스텀 셀렉트 컴포넌트
function HoloSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-4 py-3 rounded-lg text-left text-sm font-medium transition-all duration-300
          border backdrop-blur-sm flex items-center justify-between
          ${disabled
            ? 'bg-dark-700/50 border-dark-600 text-gray-600 cursor-not-allowed'
            : isOpen
              ? 'bg-dark-700 border-[#00F2FF]/60 text-white shadow-[0_0_20px_rgba(0,242,255,0.2)]'
              : 'bg-dark-700/80 border-dark-500 text-gray-300 hover:border-[#00F2FF]/40 hover:text-white'
          }
        `}
      >
        <span className={value ? '' : 'text-gray-500'}>{value || placeholder}</span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 py-2 bg-dark-800/95 backdrop-blur-xl border border-[#00F2FF]/30 rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.5),0_0_15px_rgba(0,242,255,0.1)] max-h-48 overflow-y-auto scrollbar-gaming">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className={`
                w-full px-4 py-2.5 text-left text-sm transition-all duration-200
                flex items-center gap-3
                ${value === option
                  ? 'bg-[#00F2FF]/10 text-[#00F2FF]'
                  : 'text-gray-300 hover:bg-dark-700 hover:text-white'
                }
              `}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${value === option ? 'bg-[#00F2FF] shadow-[0_0_8px_rgba(0,242,255,0.8)]' : 'bg-dark-500'}`} />
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 액션 버튼 컴포넌트
function ActionButton({
  onClick,
  disabled,
  variant = 'primary',
  children,
  icon: Icon,
  loading = false,
}: {
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'success';
  children: React.ReactNode;
  icon: React.ElementType;
  loading?: boolean;
}) {
  const variants = {
    primary: `
      bg-gradient-to-r from-[#00D9A5] via-[#00F2FF] to-[#00C4E0]
      text-dark-900 font-bold
      border border-white/30
      shadow-[0_0_30px_rgba(0,242,255,0.4),inset_0_1px_0_rgba(255,255,255,0.3)]
      hover:shadow-[0_0_50px_rgba(0,242,255,0.6),0_0_80px_rgba(0,242,255,0.3)]
      hover:scale-[1.02]
      active:scale-[0.98]
      disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none
    `,
    secondary: `
      bg-dark-700/80 text-gray-300
      border border-dark-500
      hover:bg-dark-600 hover:text-white hover:border-gray-500
      active:bg-dark-700
      disabled:opacity-40 disabled:cursor-not-allowed
    `,
    success: `
      bg-gradient-to-r from-[#00ff88]/80 to-[#00F2FF]/80
      text-dark-900 font-bold
      border border-white/20
      shadow-[0_0_20px_rgba(0,255,136,0.3)]
      hover:shadow-[0_0_40px_rgba(0,255,136,0.5)]
      hover:scale-[1.02]
      active:scale-[0.98]
      disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none
    `,
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        relative w-full py-3.5 px-4 rounded-xl font-mono text-sm tracking-wider
        transition-all duration-300 flex items-center justify-center gap-2.5
        overflow-hidden
        ${variants[variant]}
      `}
    >
      {/* 스캔라인 효과 */}
      {variant === 'primary' && !disabled && (
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/20 to-transparent h-[200%] animate-scan" />
        </div>
      )}

      <Icon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
      <span className="relative">{children}</span>
    </button>
  );
}

export default function Sidebar({
  onStartInterview,
  onReset,
  onAnalyze,
  isInterviewStarted = false,
  selectedJob = '',
  selectedCompany = '',
  onJobChange,
  onCompanyChange,
  sttModel = 'OpenAI Whisper',
  onSttModelChange,
  questionCount = 0,
  canAnalyze = false,
  isAnalyzing = false,
  onResumeUpload,
  isMobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const [jobCategory, setJobCategory] = useState<'사무직군' | '개발직군'>('사무직군');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dagloKeyExists, setDagloKeyExists] = useState<boolean | null>(null);
  const [hasResume, setHasResume] = useState(false);

  const jobList = jobCategory === '사무직군' ? 사무직군 : 개발직군;

  // 진행 단계 계산
  const currentStep = selectedJob ? (selectedCompany ? 3 : 2) : (jobCategory ? 1 : 0);

  const handleJobCategoryChange = (category: '사무직군' | '개발직군') => {
    setJobCategory(category);
    if (onJobChange) {
      onJobChange('');
    }
  };

  // Daglo API 키 존재 여부 확인
  useEffect(() => {
    if (sttModel === 'Daglo') {
      setDagloKeyExists(null);
      fetch('/api/check-env?key=DAGLO_API_KEY')
        .then((res) => res.ok ? res.json() : Promise.reject())
        .then((data) => setDagloKeyExists(!data.error && data.exists))
        .catch(() => setDagloKeyExists(false));
    } else {
      setDagloKeyExists(null);
    }
  }, [sttModel]);

  return (
    <>
      {/* 모바일 오버레이 */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* 사이드바 컨테이너 */}
      <div
        className={`
          h-full relative rounded-2xl overflow-hidden
          md:block
          ${isMobileOpen
            ? 'fixed inset-y-0 left-0 w-80 z-50 rounded-none md:relative md:w-full md:z-auto'
            : 'hidden md:block'
          }
          transition-transform duration-300 ease-out
        `}
      >
        {/* 모바일 닫기 버튼 */}
        <button
          onClick={onMobileClose}
          className="absolute top-4 right-4 z-10 md:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-dark-700/80 border border-[#00F2FF]/30 hover:bg-dark-600 transition-colors"
          aria-label="메뉴 닫기"
        >
          <X className="w-4 h-4 text-[#00F2FF]" />
        </button>

        {/* 배경 레이어 */}
        <div className="absolute inset-0 bg-gradient-to-b from-dark-800/95 via-dark-800/98 to-dark-900" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDI0MiwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-50" />

        {/* HUD 코너 프레임 - 모바일에서는 왼쪽만 둥글게 */}
        <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 border-[#00F2FF]/60 rounded-tl-2xl md:rounded-tl-2xl" />
        <div className="absolute top-0 right-0 w-8 h-8 border-r-2 border-t-2 border-[#8b5cf6]/60 md:rounded-tr-2xl" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-l-2 border-b-2 border-[#8b5cf6]/60 rounded-bl-2xl md:rounded-bl-2xl" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-r-2 border-b-2 border-[#00F2FF]/60 md:rounded-br-2xl" />

        {/* 메인 보더 */}
        <div className="absolute inset-0 border border-white/10 rounded-none md:rounded-2xl" />

      {/* 콘텐츠 */}
      <div className="relative h-full flex flex-col p-5 overflow-y-auto overflow-x-hidden scrollbar-gaming">

        {/* 헤더 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <div className="absolute inset-0 bg-[#00F2FF]/20 rounded-xl blur-xl" />
              <div className="relative p-2.5 bg-gradient-to-br from-dark-700 to-dark-800 rounded-xl border border-[#00F2FF]/30">
                <Cpu className="w-6 h-6 text-[#00F2FF] drop-shadow-[0_0_10px_rgba(0,242,255,0.8)]" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">MISSION CONFIG</h2>
              <p className="text-[10px] font-mono text-[#00F2FF]/60 tracking-[0.2em]">INTERVIEW SETUP v2.0</p>
            </div>
          </div>

          {/* 진행 인디케이터 */}
          <StepIndicator currentStep={currentStep} totalSteps={3} />
        </div>

        {/* 섹션들 */}
        <div className="space-y-5 flex-1">

          {/* STEP 1: 직군 카테고리 */}
          <div className="space-y-3">
            <SectionHeader
              icon={Gamepad2}
              title="직군 카테고리"
              subtitle="SELECT DIVISION"
              status={jobCategory ? 'complete' : 'active'}
              glowColor="cyan"
            />
            <div className="grid grid-cols-2 gap-2">
              <SelectionChip
                selected={jobCategory === '사무직군'}
                onClick={() => handleJobCategoryChange('사무직군')}
              >
                사무직군
              </SelectionChip>
              <SelectionChip
                selected={jobCategory === '개발직군'}
                onClick={() => handleJobCategoryChange('개발직군')}
              >
                개발직군
              </SelectionChip>
            </div>
          </div>

          {/* STEP 2: 직군 선택 */}
          <div className="space-y-3">
            <SectionHeader
              icon={Target}
              title="지원 직군"
              subtitle="SELECT POSITION"
              status={selectedJob ? 'complete' : jobCategory ? 'active' : 'locked'}
              glowColor="purple"
            />
            <HoloSelect
              value={selectedJob}
              onChange={(v) => onJobChange?.(v)}
              options={jobList}
              placeholder="직군을 선택하세요"
              disabled={!jobCategory}
            />
          </div>

          {/* STEP 3: 회사 선택 */}
          <div className={`space-y-3 transition-opacity duration-300 ${!selectedJob ? 'opacity-50' : ''}`}>
            <SectionHeader
              icon={Building2}
              title="지원 회사"
              subtitle="SELECT COMPANY"
              status={selectedCompany ? 'complete' : selectedJob ? 'active' : 'locked'}
              glowColor="green"
            />
            <HoloSelect
              value={selectedCompany}
              onChange={(v) => onCompanyChange?.(v)}
              options={COMPANY_LIST}
              placeholder="회사를 선택하세요"
              disabled={!selectedJob}
            />
          </div>

          {/* 선택 완료 상태 표시 */}
          {selectedJob && selectedCompany && (
            <div className="relative p-4 rounded-xl overflow-hidden">
              {/* 배경 효과 */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#00ff88]/10 via-[#00F2FF]/10 to-[#8b5cf6]/10" />
              <div className="absolute inset-0 border border-[#00ff88]/30 rounded-xl" />

              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-[#00ff88] drop-shadow-[0_0_8px_rgba(0,255,136,0.8)]" />
                  <span className="text-xs font-mono text-[#00ff88] tracking-wider">MISSION READY</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00F2FF]" />
                    <span className="text-gray-400">직군:</span>
                    <span className="text-white font-medium">{selectedJob}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6]" />
                    <span className="text-gray-400">회사:</span>
                    <span className="text-white font-medium">{selectedCompany}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 자소서 업로드 */}
          <div className="space-y-3">
            <SectionHeader
              icon={Upload}
              title="자소서 업로드"
              subtitle="OPTIONAL DATA"
              status={hasResume ? 'complete' : 'active'}
              glowColor="pink"
            />
            <label className="block relative cursor-pointer group">
              <input
                type="file"
                accept=".txt"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const text = typeof reader.result === 'string' ? reader.result : '';
                    onResumeUpload?.(text);
                    setHasResume(true);
                  };
                  reader.readAsText(file, 'utf-8');
                }}
              />
              <div className={`
                p-4 rounded-xl border-2 border-dashed transition-all duration-300
                ${hasResume
                  ? 'border-[#00ff88]/50 bg-[#00ff88]/5'
                  : 'border-dark-500 bg-dark-700/50 group-hover:border-[#ff00a8]/50 group-hover:bg-[#ff00a8]/5'
                }
              `}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${hasResume ? 'bg-[#00ff88]/10' : 'bg-dark-600 group-hover:bg-[#ff00a8]/10'}`}>
                    {hasResume ? (
                      <CheckCircle2 className="w-5 h-5 text-[#00ff88]" />
                    ) : (
                      <Upload className="w-5 h-5 text-gray-500 group-hover:text-[#ff00a8]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${hasResume ? 'text-[#00ff88]' : 'text-gray-400'}`}>
                      {hasResume ? '업로드 완료' : '.txt 파일 선택'}
                    </p>
                    <p className="text-[10px] text-gray-600 truncate">
                      {hasResume ? '자소서 기반 질문이 생성됩니다' : '자소서 기반 맞춤 질문 생성'}
                    </p>
                  </div>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* 고급 설정 토글 */}
        <div className="mt-4 border-t border-dark-600/50 pt-4">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between text-sm font-medium text-gray-400 hover:text-white transition-colors py-2"
          >
            <span className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#00F2FF]" />
              <span className="font-mono tracking-wider text-xs">ADVANCED</span>
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 bg-dark-700/50 rounded-xl border border-dark-600 space-y-4">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-2 tracking-wider">STT MODEL</label>
                <div className="space-y-2">
                  {['OpenAI Whisper', 'Daglo'].map((model) => (
                    <label
                      key={model}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                        ${sttModel === model
                          ? 'bg-[#00F2FF]/10 border border-[#00F2FF]/30'
                          : 'bg-dark-600/50 border border-transparent hover:border-dark-500'
                        }
                      `}
                    >
                      <input
                        type="radio"
                        name="sttModel"
                        value={model}
                        checked={sttModel === model}
                        onChange={() => onSttModelChange?.(model as 'OpenAI Whisper' | 'Daglo')}
                        className="sr-only"
                      />
                      <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                        sttModel === model ? 'border-[#00F2FF] bg-[#00F2FF]' : 'border-gray-500'
                      }`}>
                        {sttModel === model && <div className="w-1 h-1 rounded-full bg-dark-900" />}
                      </div>
                      <span className={`text-sm ${sttModel === model ? 'text-white' : 'text-gray-400'}`}>{model}</span>
                    </label>
                  ))}
                </div>
                {sttModel === 'Daglo' && dagloKeyExists !== null && (
                  <div className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-2 ${
                    dagloKeyExists ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {dagloKeyExists ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {dagloKeyExists ? 'API KEY 설정됨' : 'API KEY 미설정'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* API 상태 */}
        <div className="mt-4 p-3 bg-dark-700/30 rounded-lg border border-dark-600/50">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-gray-500 tracking-widest">SYSTEM STATUS</span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-2 h-2 bg-[#00ff88] rounded-full" />
                <div className="absolute inset-0 w-2 h-2 bg-[#00ff88] rounded-full animate-ping opacity-75" />
              </div>
              <span className="text-[10px] font-mono text-[#00ff88] tracking-wider">ONLINE</span>
            </div>
          </div>
        </div>

        {/* 개발자 모드 */}
        <DevModeSection />

        {/* 구분선 */}
        <div className="my-5 relative">
          <div className="h-px bg-gradient-to-r from-transparent via-[#00F2FF]/30 to-transparent" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-3 bg-dark-800">
            <span className="text-[10px] font-mono text-[#00F2FF]/50 tracking-[0.3em]">ACTION</span>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="space-y-3">
          <ActionButton
            onClick={onStartInterview}
            disabled={isInterviewStarted || !selectedJob || !selectedCompany}
            variant="primary"
            icon={Play}
          >
            {isInterviewStarted ? 'IN PROGRESS...' : !selectedJob || !selectedCompany ? 'SELECT OPTIONS' : 'START INTERVIEW'}
          </ActionButton>

          <ActionButton
            onClick={onReset}
            variant="secondary"
            icon={RotateCcw}
          >
            RESET
          </ActionButton>

          <ActionButton
            onClick={onAnalyze}
            disabled={!canAnalyze || isAnalyzing}
            variant="success"
            icon={FileCheck}
            loading={isAnalyzing}
          >
            {isAnalyzing ? 'ANALYZING...' : 'END & ANALYZE'}
          </ActionButton>

          {/* 경고 메시지 */}
          {isInterviewStarted && questionCount > 0 && questionCount < 5 && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <p className="text-xs text-yellow-400">
                최소 5개 질문 필요 ({questionCount}/5)
              </p>
            </div>
          )}
        </div>
      </div>

        {/* 스타일 정의 */}
        <style jsx>{`
          @keyframes scan {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100%); }
          }
          .animate-scan {
            animation: scan 2s linear infinite;
          }
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .animate-shimmer {
            animation: shimmer 2s infinite;
          }
        `}</style>
      </div>
    </>
  );
}

// 개발자 모드 섹션 컴포넌트
function DevModeSection() {
  const { isDevMode, setIsDevMode, config, setConfig } = useDevMode();
  const [selectedPresetId, setSelectedPresetId] = useState<string>('standard');
  const [promptText, setPromptText] = useState<string>(config.systemPrompt || '');

  return (
    <div className="mt-4 border-t border-dark-600/50 pt-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-[#ff00a8]" />
          <span className="text-xs font-mono text-gray-400 tracking-wider">DEV MODE</span>
        </label>
        <button
          onClick={() => setIsDevMode(!isDevMode)}
          className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
            isDevMode
              ? 'bg-gradient-to-r from-[#00F2FF] to-[#8b5cf6] shadow-[0_0_15px_rgba(0,242,255,0.4)]'
              : 'bg-dark-600'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-md ${
            isDevMode ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {isDevMode && (
        <div className="mt-4 p-4 bg-dark-700/50 rounded-xl border border-dark-600 space-y-4">
          {/* 프리셋 */}
          <div>
            <label className="block text-xs font-mono text-gray-400 mb-2">PRESET</label>
            <select
              value={selectedPresetId}
              onChange={(e) => {
                const presetId = e.target.value;
                setSelectedPresetId(presetId);
                const preset = PROMPT_PRESETS.find((p) => p.id === presetId);
                const newPrompt = preset?.prompt || '';
                setPromptText(newPrompt);
                setConfig({ ...config, systemPrompt: newPrompt || undefined });
              }}
              className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-sm text-gray-300 focus:border-[#00F2FF]/50 focus:outline-none"
            >
              {PROMPT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono text-gray-400">TEMPERATURE</label>
              <span className="text-xs font-mono text-[#00F2FF]">{config.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-dark-600 rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-[#00F2FF]
                [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,242,255,0.6)]
                [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-xs font-mono text-gray-400 mb-2">MAX TOKENS</label>
            <input
              type="number"
              min="100"
              max="4000"
              step="100"
              value={config.maxTokens}
              onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) || 500 })}
              className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-sm text-gray-300 focus:border-[#00F2FF]/50 focus:outline-none"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-xs font-mono text-gray-400 mb-2">SYSTEM PROMPT</label>
            <textarea
              value={promptText}
              onChange={(e) => {
                const value = e.target.value;
                setPromptText(value);
                setConfig({ ...config, systemPrompt: value || undefined });
              }}
              placeholder="Custom system prompt..."
              className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-xs text-gray-300 resize-none h-24 focus:border-[#00F2FF]/50 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
