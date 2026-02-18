'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Loader2, AlertCircle, Cpu } from 'lucide-react';

export default function AuthScreen() {
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || isSubmitting) return;

    setError('');
    setIsSubmitting(true);

    try {
      await login(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* 배경 그리드 */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDI0MiwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-50" />

      {/* 글로우 배경 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00F2FF]/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-[#8b5cf6]/5 rounded-full blur-[100px]" />

      {/* 카드 */}
      <div className="relative w-full max-w-md">
        {/* HUD 코너 */}
        <div className="absolute -top-1 -left-1 w-8 h-8 border-l-2 border-t-2 border-[#00F2FF]/60 rounded-tl-2xl" />
        <div className="absolute -top-1 -right-1 w-8 h-8 border-r-2 border-t-2 border-[#8b5cf6]/60 rounded-tr-2xl" />
        <div className="absolute -bottom-1 -left-1 w-8 h-8 border-l-2 border-b-2 border-[#8b5cf6]/60 rounded-bl-2xl" />
        <div className="absolute -bottom-1 -right-1 w-8 h-8 border-r-2 border-b-2 border-[#00F2FF]/60 rounded-br-2xl" />

        <div className="glass-card-dark rounded-2xl p-8 border border-white/10">
          {/* 헤더 */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-[#00F2FF]/20 rounded-2xl blur-xl" />
              <div className="relative p-4 bg-gradient-to-br from-dark-700 to-dark-800 rounded-2xl border border-[#00F2FF]/30">
                <Cpu className="w-10 h-10 text-[#00F2FF] drop-shadow-[0_0_10px_rgba(0,242,255,0.8)]" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wide mb-1">ENENI INTERVIEW</h1>
            <p className="text-xs font-mono text-[#00F2FF]/60 tracking-[0.2em]">STUDENT AUTHENTICATION</p>
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-2 tracking-wider">
                <Shield className="w-3 h-3 inline mr-1.5" />
                STUDENT CODE
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={20}
                placeholder="STU-A3X9"
                autoFocus
                disabled={isSubmitting}
                className="w-full px-4 py-3.5 bg-dark-700/80 border border-dark-500 rounded-xl text-white text-lg font-mono tracking-widest placeholder:text-gray-600 focus:border-[#00F2FF]/60 focus:outline-none focus:shadow-[0_0_20px_rgba(0,242,255,0.15)] transition-all duration-300 disabled:opacity-50"
              />
            </div>

            {/* 에러 표시 */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* 제출 버튼 */}
            <button
              type="submit"
              disabled={!code.trim() || isSubmitting}
              className="
                relative w-full py-3.5 px-4 rounded-xl font-mono text-sm tracking-wider
                transition-all duration-300 flex items-center justify-center gap-2.5
                overflow-hidden
                bg-gradient-to-r from-[#00D9A5] via-[#00F2FF] to-[#00C4E0]
                text-dark-900 font-bold
                border border-white/30
                shadow-[0_0_30px_rgba(0,242,255,0.4),inset_0_1px_0_rgba(255,255,255,0.3)]
                hover:shadow-[0_0_50px_rgba(0,242,255,0.6),0_0_80px_rgba(0,242,255,0.3)]
                hover:scale-[1.02]
                active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none
              "
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>VERIFYING...</span>
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  <span>AUTHENTICATE</span>
                </>
              )}
            </button>
          </form>

          {/* 안내 */}
          <p className="mt-6 text-center text-xs text-gray-500">
            수강생 코드는 수업 시 안내받은 코드를 입력해주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
