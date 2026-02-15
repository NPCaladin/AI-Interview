import fs from 'fs';
import path from 'path';
import type { InterviewData } from '@/lib/types';

let cachedData: InterviewData | null = null;

export function getInterviewData(): InterviewData | null {
  if (cachedData) return cachedData;

  try {
    const filePath = path.join(process.cwd(), 'public', 'interview_data.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    cachedData = JSON.parse(raw) as InterviewData;
    return cachedData;
  } catch (error) {
    console.error('interview_data.json 로드 실패:', error);
    return null;
  }
}
