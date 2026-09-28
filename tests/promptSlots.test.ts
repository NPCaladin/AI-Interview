import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SUMMARY_ANALYSIS_PROMPT, DETAIL_ANALYSIS_PROMPT } from '@/lib/prompts-stream';
import { buildSystemPrompt } from '@/lib/buildSystemPrompt';
import type { InterviewData } from '@/lib/types';
import {
  PROMPT_SLOTS,
  PROMPT_SLOT_META,
  buildRollbackMemo,
  buildSlotVars,
  getDefaultSlotBody,
  renderSlot,
  validateSlotBody,
} from '@/lib/promptSlots';

/**
 * 픽스처는 리팩토링 "전" 코드 출력의 스냅샷이다 (tests/fixtures/prompt_*.txt).
 * git autocrlf 로 CRLF 가 될 수 있어 읽을 때만 LF 로 정규화한다 (프롬프트 자체에는 \r 이 없음).
 */
function fixture(name: string): string {
  return fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf-8').replace(/\r\n/g, '\n');
}

describe('회귀 0 — DB 버전 없을 때 기본값 렌더 == 리팩토링 전 출력', () => {
  it('SUMMARY (넥슨)', () => {
    expect(SUMMARY_ANALYSIS_PROMPT('게임기획', 5, '넥슨')).toBe(fixture('prompt_summary_nexon.txt'));
  });

  it('SUMMARY (회사 없음)', () => {
    expect(SUMMARY_ANALYSIS_PROMPT('게임기획', 5, undefined)).toBe(fixture('prompt_summary_nocompany.txt'));
  });

  it('DETAIL (넥슨, Q1~5)', () => {
    expect(DETAIL_ANALYSIS_PROMPT('게임기획', [1, 2, 3, 4, 5], '넥슨')).toBe(fixture('prompt_detail_nexon.txt'));
  });

  it('라우트 경로(명시 rulesBlock = 기본값 렌더)도 동일', () => {
    const sBlock = renderSlot(
      getDefaultSlotBody('analysis_summary_rules'),
      buildSlotVars({ job: '게임기획', company: '넥슨', questionCount: 5 })
    );
    expect(SUMMARY_ANALYSIS_PROMPT('게임기획', 5, '넥슨', sBlock)).toBe(fixture('prompt_summary_nexon.txt'));
    const dBlock = renderSlot(
      getDefaultSlotBody('analysis_detail_rules'),
      buildSlotVars({ job: '게임기획', company: '넥슨', questionNumbers: [1, 2, 3, 4, 5] })
    );
    expect(DETAIL_ANALYSIS_PROMPT('게임기획', [1, 2, 3, 4, 5], '넥슨', dBlock)).toBe(
      fixture('prompt_detail_nexon.txt')
    );
  });

  it('persona 기본값 == 원본 personaAndRulesSection', () => {
    expect(getDefaultSlotBody('interviewer_persona')).toBe(fixture('prompt_persona_default.txt'));
  });

  it('buildSystemPrompt 전체 (override 없음 / 기본값 override) == 원본', () => {
    const data = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'public', 'interview_data.json'), 'utf-8')
    ) as InterviewData;
    const expected = fixture('prompt_system_full.txt');
    expect(buildSystemPrompt(data, '게임기획', '넥슨', 0, undefined, undefined, [], undefined)).toBe(expected);
    // chat 라우트: DB 버전 없으면 getActiveSlotBody 가 기본값을 돌려주고 그것이 override 로 전달됨
    expect(
      buildSystemPrompt(data, '게임기획', '넥슨', 0, undefined, getDefaultSlotBody('interviewer_persona'), [], undefined)
    ).toBe(expected);
  });
});

describe('renderSlot', () => {
  it('제공된 변수 치환', () => {
    expect(renderSlot('직군 {{job}} / 회사 {{company}} / {{question_count}}문항', {
      job: '게임기획',
      company: '넥슨',
      question_count: '5',
    })).toBe('직군 게임기획 / 회사 넥슨 / 5문항');
  });

  it('미지원·미제공 플레이스홀더는 그대로 보존', () => {
    expect(renderSlot('{{job}} {{unknown_var}} {{company}}', { job: 'QA' })).toBe('QA {{unknown_var}} {{company}}');
  });

  it('치환 값은 다시 스캔하지 않음', () => {
    expect(renderSlot('{{job}}', { job: '{{company}}', company: 'X' })).toBe('{{company}}');
  });

  it('buildSlotVars — 미제공 키 없음, question_numbers 는 쉼표 조인', () => {
    const v = buildSlotVars({ questionNumbers: [1, 2, 3] });
    expect(v.question_numbers).toBe('1, 2, 3');
    expect('job' in v).toBe(false);
    expect('company' in v).toBe(false);
    expect(v.score_bands.split('\n')).toHaveLength(5);
    expect(v.pass_criteria.split('\n')).toHaveLength(3);
  });
});

describe('validateSlotBody', () => {
  it('기본값은 모든 슬롯에서 통과', () => {
    for (const slot of PROMPT_SLOTS) {
      expect(validateSlotBody(slot, getDefaultSlotBody(slot))).toEqual({ ok: true });
    }
  });

  it('길이 10~30,000자', () => {
    expect(validateSlotBody('interviewer_persona', '짧음').ok).toBe(false);
    expect(validateSlotBody('interviewer_persona', 'a'.repeat(10)).ok).toBe(true);
    expect(validateSlotBody('interviewer_persona', 'a'.repeat(30000)).ok).toBe(true);
    expect(validateSlotBody('interviewer_persona', 'a'.repeat(30001)).ok).toBe(false);
  });

  it('{{ }} 짝 검사', () => {
    expect(validateSlotBody('interviewer_persona', '본문 {{job 닫힘 없음 ....').ok).toBe(false);
    expect(validateSlotBody('interviewer_persona', '본문 job}} 열림 없음 ....').ok).toBe(false);
    expect(validateSlotBody('interviewer_persona', '본문 {{a {{b}} 중첩 ....').ok).toBe(false);
    expect(validateSlotBody('interviewer_persona', '본문 {{job}} 정상 짝 ....').ok).toBe(true);
  });

  it('summary/detail 은 {{score_bands}} 필수, persona 는 필수 없음', () => {
    const noBands = '## 평가 항목\n{{rubric}}\n충분히 긴 본문';
    expect(validateSlotBody('analysis_summary_rules', noBands).ok).toBe(false);
    expect(validateSlotBody('analysis_detail_rules', noBands).ok).toBe(false);
    expect(validateSlotBody('analysis_summary_rules', `${noBands}\n{{score_bands}}`).ok).toBe(true);
    expect(validateSlotBody('analysis_detail_rules', '점수\n{{score_bands}}\n끝').ok).toBe(true);
    expect(validateSlotBody('interviewer_persona', noBands).ok).toBe(true);
    expect(PROMPT_SLOT_META.interviewer_persona.required).toEqual([]);
  });
});

describe('buildRollbackMemo', () => {
  it('[ROLLBACK to <id 앞 8자>] <원 메모>', () => {
    expect(buildRollbackMemo('d3c4885b-a075-42dd-9160-13a8387d8757', '톤 완화')).toBe('[ROLLBACK to d3c4885b] 톤 완화');
  });
  it('원 메모 없음', () => {
    expect(buildRollbackMemo('d3c4885b-a075-42dd-9160-13a8387d8757', null)).toBe('[ROLLBACK to d3c4885b] ');
  });
});
