# HRer 전체 지도 (Master Map)
최종 갱신: 2026-04-19

이 문서는 HRer의 기술·서비스·마케팅·운영 전체를 한눈에 보기 위한 지도입니다. 작업 방향·우선순위·리스크 판단에 참조하세요.

---

## Layer 1: 지식·데이터 (뿌리)

### 로컬 Mac (HRer_AI)
- ✅ **HRer_DB.sqlite** (약 24만 건)
  - 판례 13,690 / 노동위 90,232 / 고용노동부법령해석 17,227
  - 행정해석 5,501 / 국가인권위 3,959 / 헌재결정례 66
  - 법령 1,848 / 현행법령 68 / 행정규칙 158
  - **자문패턴 1,946** (답변요지 81% 채움, taxonomy 태깅 완료)
  - 이메일 최종발송본 1,954
  - NCS 분류 1,094 / 능력단위 13,289
  - 월간노동법률 3,316 / 서식 391
- ✅ 수집 파이프라인 (daily_update·collect_*·file_watcher)
- ✅ 검색·검증 도구 (search_db, verify_citations, check_consistency)
- ✅ 규칙 (CLAUDE.md + rules/ 11개)
- 🔔 Mac ↔ Supabase 자동 양방향 동기화 (미구현)

---

## Layer 2: 서버 인프라

### Vercel Edge Functions
- ✅ `api/chat.js` — 챗봇 스트리밍 (Gemini, 3단계 모델 폴백)
- ✅ `api/summarize.js` — 대화 요약·taxonomy 추천
- ✅ `api/log.js` — 이벤트 로깅
- ✅ `api/admin.js` — 관리자 API (토큰 인증)
- ✅ `api/answer.js` — 답변 작성 (hrer 자동 / 원팀 수동 이중 채널)
- ✅ `api/inquiry.js` — 견적형 4개 서비스 무료 접수
- ✅ `api/confirm-payment.js` — Toss 승인 + Supabase + 이메일 + 텔레그램 (Edge 전환)
- ✅ `api/_db.js` — Supabase REST 유틸

### Supabase (PostgreSQL)
- ✅ `chat_sessions` / `chat_messages` (대화 축적)
- ✅ `chat_feedback` / `chat_misses`
- ✅ `orders` (taxonomy·utm·handoff·raw_input·response_body·ai_draft까지)
- 🔔 `learning_examples` (v4 스키마 준비, Supabase 적용 대기)

### 외부
- ✅ Toss Payments (테스트 키, 법인 후 상용)
- ⚠ Resend (hrer.kr 도메인 검증 필요)
- 🔔 Anthropic API (법인 후)
- 🔔 Telegram Bot (env 설정 시 자동)

---

## Layer 3: 프론트엔드

### 홈페이지 (9페이지 + 대시보드)
- ✅ 랜딩 (index.html)
- ✅ 4대 서비스 페이지 (consultation·unfair-dismissal·investigation·hr-evaluation·employment-rules)
- ✅ 5개 의뢰 폼 (order·order_4종)
- ✅ complete.html (결제 결과 + 견적 접수 분기)
- ✅ privacy / terms (AI·Supabase 고지 업데이트)
- ✅ case-trends.html
- ✅ bot-admin.html (관리 대시보드 + 답변 작성 + A 초안 표시)

### 스크립트·데이터
- ✅ chatbot.js (위젯, 5중 방어막, SSE 스트리밍, handoff 미러)
- ✅ handoff.js (대화→의뢰폼 자동 연결)
- ✅ cta.js (22개 taxonomy별 맞춤 CTA, 동료 발견 리스크 대비 실명 제거)
- ✅ chatbot-data.json (FAQ 81건 전부 taxonomy 태깅)
- ✅ taxonomy.json (22대분류 + 120여 세부태그 공통 키)
- ✅ sitemap.xml + robots.txt

### SEO
- ✅ canonical 전체 페이지 적용
- ✅ order·complete·bot-admin noindex
- ✅ OG 이미지·메타태그 전 페이지 완비
- 🔔 도메인 연결 후 URL 일괄 변경 필요 (vercel.app → hrer.kr)

---

## Layer 4: AI 에이전트

### 챗봇 (고객 노출, 운영 중)
- Gemini Flash Lite → Flash → 2.0 Flash 폴백
- Edge Runtime (Tokyo)
- 5중 방어막 (system prompt + RAG + safety + sanitize + disclaimer)
- Supabase 대화 축적
- 타겟: 회사·HR 담당자 (근로자 개인도 커버)

### 자문봇 (내부 전용, Phase 1 완료)
**위치**: `HRer_AI/advisor_bot/` 5개 모듈
- ✅ `prompt_builder.py` (CLAUDE.md + rules/ tier별 통합)
- ✅ `rag.py` (HRer_DB 5단 검색)
- ✅ `fewshot.py` (자문패턴 Few-shot 추출)
- ✅ `assembler.py` (전체 입력 조립)
- ✅ `parser.py` (LLM 출력 → body + citations 분리)
- ✅ `diff.py` (A vs B 격차 측정 엔진, embedding 없이)
- ✅ `dry_run.py` (Claude 없이 파이프 시뮬레이션)

**검증 완료**: 3가지 시나리오 dry-run (해고·괴롭힘·퇴직)
**실측 비용**: 의뢰 1건 $0.045~0.053 (Claude Sonnet 4.6 기준)

**법인 후 Activation (1~2시간)**:
1. Anthropic API 키 발급
2. `generator.py` 작성 (README 템플릿 그대로)
3. Supabase polling 워커 + cron
4. A→B diff → learning_examples 저장

---

## Layer 5: 서비스 (5종)

| 서비스 | 결제 | 접수 API | Supabase | 이메일 |
|--------|------|----------|----------|--------|
| 노무 자문 (간편/심층/서면) | ✅ Toss | `/api/confirm-payment` | ✅ | ✅ |
| 부당해고·사건 | 견적 | `/api/inquiry` | ✅ | ✅ |
| 괴롭힘·성희롱 조사 | 견적 | `/api/inquiry` | ✅ | ✅ |
| 인사평가 설계 | 견적 | `/api/inquiry` | ✅ | ✅ |
| 취업규칙 정비 | 견적 | `/api/inquiry` | ✅ | ✅ |

전 서비스 공통:
- 챗봇 핸드오프 → handoff_session·handoff_summary 저장
- UTM 소스·referrer 추적
- taxonomy_id 자동 태깅
- raw_input에 서비스별 상세 필드 보존

---

## Layer 6: 운영·자동화

### 현재 가동 중
- ✅ File Watcher (신규 파일 감지 → DB 적재)
- ✅ 일일 법령 업데이트 (daily_update.py)
- ✅ 오늘 자문 종료 루틴 (DB 재빌드 + 동기화 + 텔레그램)
- ✅ 과거 자문 일관성 체크 (check_consistency)
- ✅ 텔레그램 자동 알림 (자문 종료·결제·새 의뢰·법령 개정)

### 준비 완료 (활성화 대기)
- 🔔 `learning_examples` 집계 (월 1회 `analyze_gap.py`)
- 🔔 자문봇 폴링 워커 (Supabase orders 감시)
- 🔔 UTM·유입 대시보드 (Supabase 컬럼은 있고, 시각화 아직)

---

## Layer 7: 마케팅 (가장 비어 있음)

### 채널별 상태
| 채널 | 상태 | 비고 |
|------|------|------|
| SEO (구글·네이버) | 🟠 기반만 | canonical·sitemap 완비. 콘텐츠 필요 |
| 티스토리 블로그 | 🟠 77편 준비 | 리브랜딩 계획 완성, 실행 대기 |
| 네이버 블로그 (helplabor) | 🟠 보류 | 티스토리 정착 후 |
| 지식iN | 🔔 미착수 | Month 1부터 권장 |
| LinkedIn | 🔔 미착수 | Month 1부터 권장 |
| 인스타그램 | 🔔 미착수 | Month 2 |
| 브런치 | 🔔 미착수 | Month 2 |
| 유튜브 | 🔔 보류 | 법인 완료 후 |
| 제휴 파트너 | 🔔 미착수 | Month 2~3 |
| 후기·사례 | 🔔 미수집 | 첫 10명 이후 |
| 유료 광고 | 🔔 대기 | 법인 완료 후 |

### 준비 완료 자산
- ✅ 블로그 주제 제안 20+편 (`output/blog_suggestions.md`)
- ✅ 티스토리 CTA 스니펫 8종 (`output/tistory_cta_snippets.md`)
- ✅ 리브랜딩 실행 플랜 (`output/blog_rebrand_plan.md`)
- ✅ UTM 추적 인프라 (Supabase orders 컬럼)

---

## Layer 8: 법인·사업

- 🔔 유한회사 + 개인 공인노무사사무소 이중구조
- 🔔 법인 사업자등록·통장·법인카드
- ⚠ 공인노무사법 광고 규제 재검토
- 🔔 도메인 hrer.kr Vercel 연결
- 🔔 Resend hrer.kr 도메인 검증

---

## 완성도 스코어 (2026-04-19 기준)

| 영역 | 완성도 | 비고 |
|------|-------|------|
| 데이터 자산 | 95% | 업계 최상위 |
| 챗봇 프론트 | 95% | 실명 제거·polish 완료 |
| 결제·접수 | 90% | 버그 수정·이중화·견적형 4종 완비 |
| 관리 대시보드 | 90% | 답변 작성 + A 초안 영역 완비 |
| 자문봇 엔진 | 70% | Phase 1 전 파이프 완성, Claude 키 대기 |
| 오케스트라 연결 | 75% | taxonomy·UTM·handoff 통합 |
| 법적 문서 | 80% | AI·Supabase 고지 추가 |
| SEO 기초 | 85% | canonical·sitemap·robots 완비 |
| 마케팅 실행 | 10% | 자산만, 실행 대기 |
| 법인·행정 | 25% | 진행 중 |
| 레퍼런스·신뢰 | 5% | 런칭 전 |

**전체 가중평균 약 68%.** 런칭 가능 수준 75%까지 남은 것 = 마케팅 실행 + 법인 완료.

---

## 리스크 톱 5

1. **마케팅 0 상태** — 가장 치명적. Month 1부터 50% 투자 필수
2. **1인 운영 병목** — 자문봇 자동화로 완화 필요 (법인 후 최우선)
3. **공인노무사법 광고 규제** — 런칭 전 노무사회 유권해석 필수
4. **동료 발견 리스크** — 법인 완료까지 실명 비노출 유지 (✅ 정리됨)
5. **품질 클레임** — 초기 3개월 지민 직접 검토 + 배상책임보험 필수

---

## 법인 완료 이후 즉시 착수 체크리스트 (Claude Opus 참조)

1. Anthropic Console에서 API 키 발급 (법인카드 등록)
2. Vercel env `ANTHROPIC_API_KEY` 추가
3. `api/chat.js` Anthropic SSE 포맷으로 교체 (Gemini 폴백 유지)
4. `api/summarize.js` Claude API로 교체
5. `advisor_bot/generator.py` 작성 (`advisor_bot/README.md` 템플릿 참조)
6. Supabase `learning_examples` 스키마 v4 적용
7. Mac 폴링 워커 (`cron: * * * * *`)
8. Resend `hrer.kr` 도메인 검증 + DNS 3레코드
9. Toss 상용 키 발급 + env 교체
10. 도메인 hrer.kr Vercel 연결 + 전체 OG URL 일괄 변경
11. 공인노무사법 광고 규제 재검토 (노무사회 또는 법무 자문)
12. 개인 브랜딩 노출 시작 (카피·바이오·실명 단계적 공개)

---

## 자주 참조할 파일

| 파일 | 용도 |
|------|------|
| `taxonomy.json` | 공통 주제 태그 체계 (22대분류) |
| `chatbot-data.json` | 챗봇 FAQ 81건 + 인삿말·위저드 |
| `docs/advisor-bot-pipeline.md` | 자문봇 설계도 |
| `advisor_bot/README.md` | 자문봇 사용법 + 법인 후 활성화 |
| `output/blog_suggestions.md` | 블로그 주제 제안 |
| `output/tistory_cta_snippets.md` | 블로그용 CTA 8종 |
| `output/blog_rebrand_plan.md` | 티스토리 리브랜딩 플랜 |
| `supabase-schema.sql` + v2 + v3 + v4 | DB 스키마 적용 순서 |

---

## 다음 이정표

**Week 1 (지금)**: 비마케팅 나머지 정리 완료 (오늘 완료)
**Week 2**: 마케팅 실행 시작 (블로그 포스팅 + 지식iN)
**Month 1 종료**: 월 방문 100~300, 의뢰 3~5건
**법인 완료 시점**: 자문봇 활성화 + Claude 전환
**Month 3**: 월 방문 1,500~3,000, 의뢰 15~25건
**Month 6**: 월 방문 5,000~10,000, 의뢰 40~80건, 파트너 탐색
**Month 12**: 월 방문 15,000+, 의뢰 100+, 파트너 노무사 합류
