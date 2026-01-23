'use client';

import { useDevMode } from '@/contexts/DevModeContext';
import { X, Trash2, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export default function LogPanel() {
  const { debugData, clearDebugData } = useDevMode();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('복사 실패:', error);
    }
  };

  const formatJSON = (obj: any) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  if (debugData.length === 0) {
    return (
      <div className="w-96 bg-gray-900 border-l border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">🐞 Raw Data</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">API 호출 기록이 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-gray-900 border-l border-gray-700 flex flex-col">
      {/* 헤더 */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">🐞 Raw Data</h3>
        <button
          onClick={clearDebugData}
          className="p-1.5 hover:bg-gray-800 rounded transition-colors"
          title="로그 전체 삭제"
        >
          <Trash2 className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* 로그 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {debugData.map((data, index) => (
          <div
            key={index}
            className="border-b border-gray-800 p-4 hover:bg-gray-800/50 transition-colors"
          >
            {/* 메타 정보 */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {data.latency !== undefined && (
                  <span className="text-xs font-medium text-green-400">
                    {data.latency}ms
                  </span>
                )}
                {data.timestamp && (
                  <span className="text-xs text-gray-500">
                    {new Date(data.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <button
                onClick={() => copyToClipboard(formatJSON(data), index)}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
                title="JSON 복사"
              >
                {copiedIndex === index ? (
                  <Check className="w-3 h-3 text-green-400" />
                ) : (
                  <Copy className="w-3 h-3 text-gray-400" />
                )}
              </button>
            </div>

            {/* Request Body */}
            {data.requestBody && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-400 mb-1">
                  Request
                </div>
                <pre className="text-xs text-gray-300 bg-gray-950 p-2 rounded overflow-x-auto">
                  {formatJSON(data.requestBody)}
                </pre>
              </div>
            )}

            {/* Response Body */}
            {data.responseBody && (
              <div>
                <div className="text-xs font-semibold text-gray-400 mb-1">
                  Response
                </div>
                <pre className="text-xs text-gray-300 bg-gray-950 p-2 rounded overflow-x-auto">
                  {formatJSON(data.responseBody)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

