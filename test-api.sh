#!/bin/bash
# ================================================
# 종합 API 예외 상황 테스트
# ================================================

BASE="http://localhost:3000"
PASS=0
FAIL=0
RESULTS=""

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local name="$1"
  local expected_status="$2"
  local actual_status="$3"
  local body="$4"
  local check_body="$5"  # optional body check string

  if [ "$actual_status" = "$expected_status" ]; then
    if [ -n "$check_body" ]; then
      if echo "$body" | grep -q "$check_body"; then
        PASS=$((PASS+1))
        RESULTS+="  ${GREEN}PASS${NC} [$actual_status] $name\n"
      else
        FAIL=$((FAIL+1))
        RESULTS+="  ${RED}FAIL${NC} [$actual_status] $name — body missing: $check_body\n"
        RESULTS+="       body: $(echo "$body" | head -c 200)\n"
      fi
    else
      PASS=$((PASS+1))
      RESULTS+="  ${GREEN}PASS${NC} [$actual_status] $name\n"
    fi
  else
    FAIL=$((FAIL+1))
    RESULTS+="  ${RED}FAIL${NC} [$actual_status≠$expected_status] $name\n"
    RESULTS+="       body: $(echo "$body" | head -c 200)\n"
  fi
}

echo ""
echo "========================================"
echo " AUTH API TESTS"
echo "========================================"

# --- 1. Auth: 빈 코드 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "빈 코드로 로그인" "400" "$STATUS" "$BODY"

# --- 2. Auth: 잘못된 코드 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":"INVALID-XXX"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "존재하지 않는 코드" "401" "$STATUS" "$BODY" "유효하지 않은"

# --- 3. Auth: 숫자만 입력 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":"123456"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "숫자만 입력" "401" "$STATUS" "$BODY"

# --- 4. Auth: 빈 문자열 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":""}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "빈 문자열 코드" "400" "$STATUS" "$BODY"

# --- 5. Auth: SQL 인젝션 시도 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":"STU-TEST'\'' OR 1=1 --"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "SQL 인젝션 시도" "401" "$STATUS" "$BODY"

# --- 6. Auth: XSS 스크립트 코드 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":"<script>alert(1)</script>"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "XSS 스크립트 코드 입력" "401" "$STATUS" "$BODY"

# --- 7. Auth: 초장문 코드 (1000자) ---
LONG_CODE=$(python3 -c "print('A'*1000)" 2>/dev/null || python -c "print('A'*1000)" 2>/dev/null || echo "AAAAAAAAAAAAAAAAAAAAA")
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d "{\"code\":\"$LONG_CODE\"}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "초장문 코드 (1000자)" "401" "$STATUS" "$BODY"

# --- 8. Auth: null 값 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":null}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "null 코드값" "400" "$STATUS" "$BODY"

# --- 9. Auth: 숫자 타입 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":12345}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "숫자 타입 코드" "400" "$STATUS" "$BODY"

# --- 10. Auth: 유효한 코드 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":"STU-TEST"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "유효한 코드 (STU-TEST)" "200" "$STATUS" "$BODY" "token"

# JWT 토큰 추출
TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')

# --- 11. Auth: 소문자로 입력 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":"stu-test"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "소문자 코드 입력 (자동 대문자 변환)" "200" "$STATUS" "$BODY" "token"

# --- 12. Auth: 앞뒤 공백 포함 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":"  STU-TEST  "}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "공백 포함 코드" "200" "$STATUS" "$BODY" "token"

# --- 13. Auth: malformed JSON ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d 'not-json-at-all')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "malformed JSON 전송" "400" "$STATUS" "$BODY"

echo ""
echo "========================================"
echo " MIDDLEWARE (JWT) TESTS"
echo "========================================"

# --- 14. 토큰 없이 보호 API 호출 ---
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/remaining")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "토큰 없이 /api/auth/remaining" "401" "$STATUS" "$BODY" "인증"

# --- 15. 토큰 없이 chat API ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" -d '{"messages":[],"is_first":false}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "토큰 없이 /api/chat" "401" "$STATUS" "$BODY"

# --- 16. 가짜 토큰 ---
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/remaining" \
  -H "Authorization: Bearer fake.token.here")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "가짜 토큰으로 접근" "401" "$STATUS" "$BODY"

# --- 17. 만료/변조된 JWT ---
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/remaining" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdHVkZW50SWQiOiJ0ZXN0Iiwic3R1ZGVudENvZGUiOiJURVNUIiwic3R1ZGVudE5hbWUiOiLthYzsiqTtirgiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMDAwMX0.invalid")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "변조된 JWT" "401" "$STATUS" "$BODY"

# --- 18. Bearer 없이 토큰만 ---
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/remaining" \
  -H "Authorization: $TOKEN")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "Bearer prefix 없이 토큰" "401" "$STATUS" "$BODY"

# --- 19. 유효한 토큰으로 remaining 조회 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/remaining" \
    -H "Authorization: Bearer $TOKEN")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "유효한 토큰으로 remaining 조회" "200" "$STATUS" "$BODY" "remaining"
fi

echo ""
echo "========================================"
echo " CHAT API TESTS"
echo "========================================"

# --- 20. messages 필드 누락 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"is_first":false}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "messages 필드 누락" "400" "$STATUS" "$BODY" "messages"
fi

# --- 21. messages가 배열이 아닌 문자열 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"messages":"not-an-array","is_first":false}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "messages가 문자열" "400" "$STATUS" "$BODY"
fi

# --- 22. 초장문 사용자 입력 (3000자) ---
if [ -n "$TOKEN" ]; then
  LONG_MSG=$(python3 -c "print('가'*3000)" 2>/dev/null || python -c "print('A'*3000)")
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$LONG_MSG\"}],\"is_first\":false,\"question_count\":1}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "초장문 입력 (3000자, 제한 2000)" "400" "$STATUS" "$BODY" "너무 깁니다"
fi

# --- 23. question_count 음수 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"messages":[{"role":"user","content":"hello"}],"is_first":false,"question_count":-5}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  # 음수여도 에러 안 나고 정상 처리되어야 함 (safeQuestionCount로 0 처리)
  check "question_count 음수 (-5)" "200" "$STATUS" "$BODY" "message"
fi

# --- 24. question_count가 한도 초과 (100) ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"messages":[{"role":"user","content":"hello"}],"is_first":false,"question_count":100}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "question_count 초과 (100) → 면접 종료" "200" "$STATUS" "$BODY" "interview_ended"
fi

# --- 25. 빈 content 메시지 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"messages":[{"role":"user","content":""}],"is_first":false,"question_count":1}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "빈 content 메시지" "200" "$STATUS" "$BODY"
fi

# --- 26. malformed JSON to chat ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{broken json}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "chat에 malformed JSON" "400" "$STATUS" "$BODY"
fi

echo ""
echo "========================================"
echo " TTS API TESTS"
echo "========================================"

# --- 27. TTS 빈 텍스트 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/tts" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"text":""}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "TTS 빈 텍스트" "400" "$STATUS" "$BODY"
fi

# --- 28. TTS text 필드 없음 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/tts" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "TTS text 필드 누락" "400" "$STATUS" "$BODY"
fi

# --- 29. TTS 숫자 타입 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/tts" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"text":12345}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "TTS 숫자 타입 text" "400" "$STATUS" "$BODY"
fi

# --- 30. TTS 토큰 없이 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/tts" \
  -H "Content-Type: application/json" \
  -d '{"text":"hello"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "TTS 토큰 없이" "401" "$STATUS" "$BODY"

echo ""
echo "========================================"
echo " STT API TESTS"
echo "========================================"

# --- 31. STT 토큰 없이 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/stt" \
  -H "Content-Type: application/json" \
  -d '{"audio":""}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "STT 토큰 없이" "401" "$STATUS" "$BODY"

# --- 32. STT 빈 audio ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/stt" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"audio":""}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "STT 빈 audio 필드" "400" "$STATUS" "$BODY"
fi

# --- 33. STT FormData에 audio 없이 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/stt" \
    -H "Authorization: Bearer $TOKEN" \
    -F "stt_model=OpenAI Whisper")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "STT FormData audio 누락" "400" "$STATUS" "$BODY"
fi

echo ""
echo "========================================"
echo " CHECK-ENV API TESTS"
echo "========================================"

# --- 34. check-env 토큰 없이 ---
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/check-env?key=OPENAI_API_KEY")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "check-env 토큰 없이" "401" "$STATUS" "$BODY"

# --- 35. check-env 유효 토큰 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/check-env?key=OPENAI_API_KEY" \
    -H "Authorization: Bearer $TOKEN")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "check-env 유효 토큰" "200" "$STATUS" "$BODY"
fi

echo ""
echo "========================================"
echo " USAGE LIMIT TESTS"
echo "========================================"

# --- 36. is_first=true로 사용량 소진 테스트 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"messages":[],"is_first":true,"selected_job":"게임기획","selected_company":"넥슨","question_count":0}')
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "면접 시작 (사용량 소진)" "200" "$STATUS" "$BODY" "remaining"
fi

echo ""
echo "========================================"
echo " CONCURRENT REQUEST TEST"
echo "========================================"

# --- 37. 동시 2개 면접 시작 요청 ---
if [ -n "$TOKEN" ]; then
  curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"messages":[],"is_first":true,"selected_job":"게임기획","selected_company":"넥슨","question_count":0}' > /tmp/concurrent1.txt &
  PID1=$!
  curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"messages":[],"is_first":true,"selected_job":"게임기획","selected_company":"넥슨","question_count":0}' > /tmp/concurrent2.txt &
  PID2=$!
  wait $PID1 $PID2

  S1=$(tail -1 /tmp/concurrent1.txt)
  S2=$(tail -1 /tmp/concurrent2.txt)
  B1=$(sed '$d' /tmp/concurrent1.txt)
  B2=$(sed '$d' /tmp/concurrent2.txt)

  # 둘 다 200이면 각각 1회씩 소진 (정상), 429가 나오면 한도 도달
  if [ "$S1" = "200" ] || [ "$S1" = "429" ]; then
    if [ "$S2" = "200" ] || [ "$S2" = "429" ]; then
      PASS=$((PASS+1))
      RESULTS+="  ${GREEN}PASS${NC} [${S1}+${S2}] 동시 면접 시작 — 각각 정상 처리\n"
    else
      FAIL=$((FAIL+1))
      RESULTS+="  ${RED}FAIL${NC} [${S1}+${S2}] 동시 면접 시작\n"
    fi
  else
    FAIL=$((FAIL+1))
    RESULTS+="  ${RED}FAIL${NC} [${S1}+${S2}] 동시 면접 시작\n"
  fi
fi

echo ""
echo "========================================"
echo " SPECIAL CHARACTER TESTS"
echo "========================================"

# --- 38. 이모지 코드 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":"🎮🎯🎲"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "이모지 코드 입력" "401" "$STATUS" "$BODY"

# --- 39. 유니코드/한국어 코드 ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -H "Content-Type: application/json" -d '{"code":"학생코드"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "한국어 코드 입력" "401" "$STATUS" "$BODY"

# --- 40. Content-Type 없이 POST ---
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/verify" \
  -d '{"code":"STU-TEST"}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "Content-Type 없이 POST" "200" "$STATUS" "$BODY"

# --- 41. GET으로 POST 엔드포인트 접근 ---
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/verify")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)
check "GET으로 /api/auth/verify 접근" "405" "$STATUS" "$BODY"

# --- 42. 최종 사용량 확인 ---
if [ -n "$TOKEN" ]; then
  RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/remaining" \
    -H "Authorization: Bearer $TOKEN")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1)
  check "최종 사용량 확인" "200" "$STATUS" "$BODY" "remaining"
  echo ""
  echo "  ${YELLOW}[INFO]${NC} 사용량 상태: $BODY"
fi

echo ""
echo "========================================"
echo " RESULTS SUMMARY"
echo "========================================"
echo ""
echo -e "$RESULTS"
echo ""
echo "========================================"
echo -e "  TOTAL: $((PASS+FAIL)) | ${GREEN}PASS: $PASS${NC} | ${RED}FAIL: $FAIL${NC}"
echo "========================================"
echo ""
