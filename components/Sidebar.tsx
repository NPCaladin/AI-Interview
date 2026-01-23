'use client';

import { useState, useEffect } from 'react';
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
}: SidebarProps) {
  const [jobCategory, setJobCategory] = useState<'사무직군' | '개발직군'>('사무직군');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dagloKeyExists, setDagloKeyExists] = useState<boolean | null>(null);

  const jobList = jobCategory === '사무직군' ? 사무직군 : 개발직군;

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
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          if (data.error) {
            console.error('환경 변수 확인 API 오류:', data.error);
            setDagloKeyExists(false);
          } else {
            setDagloKeyExists(data.exists);
          }
        })
        .catch((error) => {
          console.error('환경 변수 확인 오류:', error);
          setDagloKeyExists(false);
        });
    } else {
      setDagloKeyExists(null);
    }
  }, [sttModel]);

  return (
    <div className="h-full glass-card-dark rounded-2xl p-5 flex flex-col overflow-y-auto overflow-x-hidden scrollbar-gaming hud-corners">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-dark-700 rounded-lg border border-[#00F2FF]/30">
          <Settings className="w-5 h-5 text-[#00F2FF] drop-shadow-[0_0_6px_rgba(0,242,255,0.8)]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">면접 설정</h2>
          <p className="text-xs text-gray-400 font-tech">INTERVIEW CONFIG</p>
        </div>
      </div>

      <div className="space-y-4 flex-1">
        {/* 직군 카테고리 카드 */}
        <div className="glass-card rounded-xl p-4 neon-border">
          <label className="block text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-[#00F2FF] drop-shadow-[0_0_6px_rgba(0,242,255,0.8)]" />
            직군 카테고리
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => handleJobCategoryChange('사무직군')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                jobCategory === '사무직군'
                  ? 'bg-gradient-gaming text-white border-2 border-[#00F2FF] shadow-[0_0_15px_rgba(0,242,255,0.5)]'
                  : 'bg-dark-700 text-gray-400 hover:bg-dark-600 hover:text-gray-300 border-2 border-transparent'
              }`}
            >
              사무직군
            </button>
            <button
              onClick={() => handleJobCategoryChange('개발직군')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                jobCategory === '개발직군'
                  ? 'bg-gradient-gaming text-white border-2 border-[#00F2FF] shadow-[0_0_15px_rgba(0,242,255,0.5)]'
                  : 'bg-dark-700 text-gray-400 hover:bg-dark-600 hover:text-gray-300 border-2 border-transparent'
              }`}
            >
              개발직군
            </button>
          </div>
        </div>

        {/* 직군 선택 카드 */}
        <div className="glass-card rounded-xl p-4">
          <label className="block text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-[#00F2FF] drop-shadow-[0_0_6px_rgba(0,242,255,0.8)]" />
            지원 직군 선택
          </label>
          <select
            value={selectedJob}
            onChange={(e) => onJobChange?.(e.target.value)}
            className="input-gaming w-full px-4 py-3 rounded-lg text-sm"
          >
            <option value="">직군을 선택하세요</option>
            {jobList.map((job) => (
              <option key={job} value={job}>
                {job}
              </option>
            ))}
          </select>
        </div>

        {/* 회사 선택 카드 */}
        {selectedJob && (
          <div className="glass-card rounded-xl p-4">
            <label className="block text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#8b5cf6] drop-shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
              회사 선택
            </label>
            <select
              value={selectedCompany}
              onChange={(e) => onCompanyChange?.(e.target.value)}
              className="input-gaming w-full px-4 py-3 rounded-lg text-sm"
            >
              <option value="">회사를 선택하세요</option>
              {COMPANY_LIST.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              면접 질문을 필터링할 회사를 선택하세요
            </p>
          </div>
        )}

        {/* 선택된 정보 표시 카드 */}
        {(selectedJob || selectedCompany) && (
          <div className="rounded-xl p-4 bg-gradient-to-r from-cyber-900/50 to-cyber-800/30 border border-cyber-500/30">
            <p className="text-xs font-medium text-cyber-300 mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              선택된 설정
            </p>
            {selectedJob && (
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-neon-green" />
                <span className="text-sm font-semibold text-gray-200">직군: {selectedJob}</span>
              </div>
            )}
            {selectedCompany && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-neon-green" />
                <span className="text-sm font-semibold text-gray-200">회사: {selectedCompany}</span>
              </div>
            )}
          </div>
        )}

        {/* 자소서 업로드 */}
        <div className="glass-card rounded-xl p-4">
          <label className="block text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#ec4899] drop-shadow-[0_0_6px_rgba(236,72,153,0.8)]" />
            자소서 업로드 (.txt)
          </label>
          <input
            type="file"
            accept=".txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const text = typeof reader.result === 'string' ? reader.result : '';
                onResumeUpload?.(text);
              };
              reader.readAsText(file, 'utf-8');
            }}
            className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-cyber-500/50 file:text-sm file:font-medium file:bg-dark-700 file:text-cyber-300 hover:file:bg-dark-600 hover:file:text-white file:cursor-pointer file:transition-all"
          />
          <p className="mt-2 text-xs text-gray-500">
            업로드된 자소서 내용을 바탕으로 직무 검증 질문을 우선 생성합니다.
          </p>
        </div>
      </div>

      {/* 고급 설정 */}
      <div className="mt-4 border-t border-dark-500 pt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-sm font-semibold text-gray-300 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#00F2FF] drop-shadow-[0_0_6px_rgba(0,242,255,0.8)]" />
            고급 설정
          </span>
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {showAdvanced && (
          <div className="mt-3 glass-card rounded-lg p-4">
            <label className="block text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
              <Mic className="w-4 h-4 text-[#00F2FF] drop-shadow-[0_0_6px_rgba(0,242,255,0.8)]" />
              STT 모델 선택
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 bg-dark-700 rounded-lg border border-dark-500 cursor-pointer hover:border-cyber-500/50 transition-all">
                <input
                  type="radio"
                  name="sttModel"
                  value="OpenAI Whisper"
                  checked={sttModel === 'OpenAI Whisper'}
                  onChange={() => onSttModelChange?.('OpenAI Whisper')}
                  className="w-4 h-4 text-cyber-500 bg-dark-600 border-dark-500 focus:ring-cyber-500"
                />
                <span className="text-sm text-gray-300">OpenAI Whisper</span>
              </label>
              <label className="flex items-center gap-3 p-3 bg-dark-700 rounded-lg border border-dark-500 cursor-pointer hover:border-cyber-500/50 transition-all">
                <input
                  type="radio"
                  name="sttModel"
                  value="Daglo"
                  checked={sttModel === 'Daglo'}
                  onChange={() => onSttModelChange?.('Daglo')}
                  className="w-4 h-4 text-cyber-500 bg-dark-600 border-dark-500 focus:ring-cyber-500"
                />
                <span className="text-sm text-gray-300">Daglo</span>
              </label>
            </div>
            {sttModel === 'Daglo' && (
              <div className={`mt-3 p-3 rounded-lg border ${
                dagloKeyExists === true
                  ? 'bg-neon-green/10 border-neon-green/30'
                  : dagloKeyExists === false
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-cyber-500/10 border-cyber-500/30'
              }`}>
                <p className={`text-xs flex items-center gap-2 ${
                  dagloKeyExists === true
                    ? 'text-neon-green'
                    : dagloKeyExists === false
                    ? 'text-yellow-400'
                    : 'text-cyber-300'
                }`}>
                  {dagloKeyExists === true ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      DAGLO_API_KEY가 설정되어 있습니다.
                    </>
                  ) : dagloKeyExists === false ? (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      DAGLO_API_KEY가 설정되지 않았습니다.
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      환경 변수 확인 중...
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* API 연결 상태 */}
      <div className="mt-4 p-3 glass-card rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-tech font-medium text-gray-400 tracking-wider">API STATUS</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#00F2FF] rounded-full animate-pulse shadow-[0_0_10px_rgba(0,242,255,0.8)]"></div>
            <span className="text-xs font-tech font-semibold text-[#00F2FF] tracking-wider">CONNECTED</span>
          </div>
        </div>
      </div>

      {/* 개발자 모드 */}
      <DevModeSection />

      {/* 구분선 */}
      <div className="mt-6 mb-4">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyber-500/50 to-transparent"></div>
        <p className="text-[10px] font-tech text-gray-500 text-center mt-2 tracking-widest">ACTION</p>
      </div>

      {/* 액션 버튼들 */}
      <div className="space-y-3">
        {/* 면접 시작 버튼 */}
        <button
          onClick={onStartInterview}
          disabled={isInterviewStarted || !selectedJob || !selectedCompany}
          className={`w-full py-3.5 px-4 font-bold transition-all flex items-center justify-center gap-2 font-tech tracking-wider ${
            isInterviewStarted || !selectedJob || !selectedCompany
              ? 'bg-dark-600 text-gray-500 cursor-not-allowed rounded-xl'
              : 'btn-cutout'
          }`}
        >
          <Play className="w-5 h-5" />
          {isInterviewStarted
            ? 'IN PROGRESS...'
            : !selectedJob || !selectedCompany
            ? 'SELECT OPTIONS'
            : 'START INTERVIEW'}
        </button>

        {/* 초기화 버튼 */}
        <button
          onClick={onReset}
          className="w-full py-2.5 px-4 bg-dark-600 text-gray-300 rounded-xl font-tech font-medium tracking-wider hover:bg-dark-500 transition-all flex items-center justify-center gap-2 border border-dark-500 hover:border-gray-500"
        >
          <RotateCcw className="w-4 h-4" />
          RESET
        </button>

        {/* 면접 종료 및 분석 버튼 */}
        <button
          onClick={onAnalyze}
          disabled={!canAnalyze || isAnalyzing}
          className={`w-full py-2.5 px-4 rounded-xl font-tech font-medium tracking-wider transition-all flex items-center justify-center gap-2 ${
            canAnalyze && !isAnalyzing
              ? 'bg-gradient-to-r from-neon-green/80 to-neon-cyan/80 text-dark-900 font-bold hover:shadow-glow-cyan'
              : 'bg-dark-600 text-gray-500 cursor-not-allowed'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          {isAnalyzing ? 'ANALYZING...' : 'END & ANALYZE'}
        </button>

        {/* 안내 문구 */}
        {isInterviewStarted && questionCount > 0 && questionCount < 5 && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-xs text-yellow-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              최소 5개의 질문에 답변해주세요 ({questionCount}/5)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// 개발자 모드 섹션 컴포넌트
function DevModeSection() {
  const { isDevMode, setIsDevMode, config, setConfig } = useDevMode();
  const [selectedPresetId, setSelectedPresetId] = useState<string>('standard');
  const [promptText, setPromptText] = useState<string>(config.systemPrompt || '');

  return (
    <div className="mt-4 border-t border-dark-500 pt-4">
      {/* 개발자 모드 토글 */}
      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <Bug className="w-4 h-4 text-[#ec4899] drop-shadow-[0_0_6px_rgba(236,72,153,0.8)]" />
          <span className="text-sm font-semibold text-gray-300">DEV MODE</span>
        </label>
        <button
          onClick={() => setIsDevMode(!isDevMode)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
            isDevMode ? 'bg-gradient-gaming shadow-glow-sm' : 'bg-dark-500'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isDevMode ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* 개발자 설정 */}
      {isDevMode && (
        <div className="mt-3 space-y-4 glass-card rounded-lg p-4">
          {/* 프롬프트 프리셋 */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2">
              Prompt Preset
            </label>
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
              className="input-gaming w-full px-3 py-2 text-sm rounded-lg"
            >
              {PROMPT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-300">
                Temperature
              </label>
              <span className="text-xs font-mono text-cyber-400">
                {config.temperature}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature}
              onChange={(e) =>
                setConfig({ ...config, temperature: parseFloat(e.target.value) })
              }
              className="w-full h-2 bg-dark-600 rounded-lg appearance-none cursor-pointer accent-cyber-500"
            />
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2">
              Max Tokens
            </label>
            <input
              type="number"
              min="100"
              max="4000"
              step="100"
              value={config.maxTokens}
              onChange={(e) =>
                setConfig({ ...config, maxTokens: parseInt(e.target.value) || 500 })
              }
              className="input-gaming w-full px-3 py-2 text-sm rounded-lg"
            />
          </div>

          {/* System Prompt Override */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2">
              System Prompt Override
            </label>
            <textarea
              value={promptText}
              onChange={(e) => {
                const value = e.target.value;
                setPromptText(value);
                setConfig({ ...config, systemPrompt: value || undefined });
              }}
              placeholder="Custom system prompt..."
              className="input-gaming w-full px-3 py-2 text-xs rounded-lg resize-none"
              rows={4}
            />
          </div>
        </div>
      )}
    </div>
  );
}
