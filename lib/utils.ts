import { 기술질문없는직군 } from './constants';
export type { InterviewData } from './types';

export function filterQuestionsByCompany(
  questions: string[],
  selectedCompany: string
): string[] {
  if (selectedCompany === "공통(회사선택X)") {
    return questions;
  }

  const filtered: string[] = [];
  for (const question of questions) {
    // [공통] 또는 [선택된 회사] 태그가 있는 질문만 포함
    const match = question.match(/\[([^\]]+)\]/);
    if (match) {
      const companyTag = match[1];
      if (companyTag === "공통" || companyTag === selectedCompany) {
        filtered.push(question);
      }
    }
  }

  return filtered;
}

export function removeCompanyTagFromQuestion(question: string): string {
  return question.replace(/\[([^\]]+)\]\s*/g, '').trim();
}

export function getCurrentPhase(questionCount: number): string {
  if (questionCount === 0) {
    return "intro";
  } else if (questionCount >= 1 && questionCount <= 4) {
    return "intro";
  } else if (questionCount >= 5 && questionCount <= 14) {
    return "job";
  } else if (questionCount >= 15 && questionCount <= 18) {
    return "personality";
  } else if (questionCount >= 19) {
    return "closing";
  } else {
    return "closing";
  }
}


