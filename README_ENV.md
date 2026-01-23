# 환경 변수 설정 가이드

## 필수 환경 변수

프로젝트 루트에 `.env.local` 파일을 생성하고 다음 환경 변수를 설정하세요:

```env
# OpenAI API Key (필수)
OPENAI_API_KEY=your_openai_api_key_here

# Daglo API Key (Daglo STT 모델 사용 시 선택)
DAGLO_API_KEY=your_daglo_api_key_here
```

## 중요 사항

1. **파일 위치**: `.env.local` 파일은 프로젝트 루트 디렉토리에 있어야 합니다.
2. **서버 재시작**: 환경 변수를 추가하거나 수정한 후에는 **반드시 개발 서버를 재시작**해야 합니다.
   ```bash
   # 개발 서버 중지 (Ctrl+C)
   # 그 다음 다시 시작
   npm run dev
   ```
3. **보안**: `.env.local` 파일은 Git에 커밋되지 않습니다 (`.gitignore`에 포함됨).
4. **키 형식**: API 키 앞뒤에 공백이나 따옴표가 없어야 합니다.

## 문제 해결

### 환경 변수가 인식되지 않는 경우

1. `.env.local` 파일이 프로젝트 루트에 있는지 확인
2. 파일 이름이 정확히 `.env.local`인지 확인 (앞에 점 포함)
3. 개발 서버를 재시작했는지 확인
4. API 키 앞뒤에 공백이나 따옴표가 없는지 확인

### Daglo 사용 시 오류가 발생하는 경우

- `.env.local`에 `DAGLO_API_KEY`가 올바르게 설정되어 있는지 확인
- 개발 서버를 재시작했는지 확인
- 서버 콘솔에서 환경 변수 로그 확인


