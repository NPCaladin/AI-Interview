/**
 * ERP 응답 페이로드 검증
 * - Zod 미도입 (현 프로젝트 관례)
 * - 규격: docs/ERP_연동_합의서_최종.md §3-4
 */

export interface ErpStudentPayload {
  student_code: string;
  name: string;
  is_active: boolean;
  updated_at: string; // ISO8601
}

export type ValidationResult =
  | { valid: true; value: ErpStudentPayload }
  | { valid: false; errors: string[] };

const STUDENT_CODE_RE = /^[A-Z0-9]{3,20}$/;

export function validateStudentPayload(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['payload must be object'] };
  }

  const rec = obj as Record<string, unknown>;

  // student_code
  const code = rec.student_code;
  if (typeof code !== 'string') {
    errors.push('student_code must be string');
  } else if (!STUDENT_CODE_RE.test(code)) {
    errors.push(`student_code format invalid: "${code}" (expected ^[A-Z0-9]{3,20}$)`);
  }

  // name
  const name = rec.name;
  if (typeof name !== 'string') {
    errors.push('name must be string');
  } else {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 50) {
      errors.push(`name length invalid: ${trimmed.length} (expected 1~50)`);
    }
  }

  // is_active
  const isActive = rec.is_active;
  if (typeof isActive !== 'boolean') {
    errors.push('is_active must be boolean');
  }

  // updated_at (ISO8601 파싱 가능)
  const updatedAt = rec.updated_at;
  if (typeof updatedAt !== 'string') {
    errors.push('updated_at must be string');
  } else {
    const t = Date.parse(updatedAt);
    if (Number.isNaN(t)) {
      errors.push(`updated_at invalid ISO8601: "${updatedAt}"`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      student_code: code as string,
      name: (name as string).trim(),
      is_active: isActive as boolean,
      updated_at: updatedAt as string,
    },
  };
}
