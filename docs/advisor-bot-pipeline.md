# 자문봇 파이프라인 설계도
작성일: 2026-04-19
상태: 설계 (구현은 법인 설립·법인카드 발급 이후)

## 0. 한 줄 요약
**고객 의뢰가 들어오면 자문봇이 초안 A를 자동 생성 → 윤지민이 최종 B를 작성 → 시스템이 A vs B를 비교·학습하여 다음 초안 품질이 점점 B에 가까워지는 자가발전 루프.**

## 1. 목적

### 1-1. 해결하려는 문제
- 현재 B(최종 답변)는 누적만 되고 시스템 개선 루프에 쓰이지 않음
- 자문봇은 엔진(Claude Code)만 있고 홈페이지 의뢰와 연결 안 됨
- 답변 품질 개선이 윤지민의 수동 피드백에만 의존 → 확장 불가

### 1-2. 목표
1. 의뢰 접수 즉시 초안 A를 자동 생성 (윤지민 검토 시간 단축)
2. A와 B의 격차를 자동 측정·누적 (개선 데이터 확보)
3. 격차 패턴을 프롬프트·RAG에 주기적으로 반영 (자동 진화)

### 1-3. 성공 지표
- **시간 절감**: B 작성 시간 30분 → 10분 (초안 활용)
- **격차 수렴**: A↔B 의미 유사도 0.7 → 0.9+ (6개월 내)
- **인용 정확도**: A의 인용(판례·행정해석) 중 B가 그대로 채택한 비율 60%+

## 2. 아키텍처

### 2-1. 전체 흐름

```
[고객]              [Vercel/Supabase]         [Mac 로컬]               [윤지민]
  │                       │                       │                       │
  │──1 챗봇 대화──────────▶│                       │                       │
  │◀─2 의뢰폼─────────────│                       │                       │
  │──3 결제──────────────▶│                       │                       │
  │                       │──4 order 저장         │                       │
  │                       │                       │                       │
  │                       │──5 webhook 트리거────▶│                       │
  │                       │                       │──6 HRer_DB 검색       │
  │                       │                       │──7 Claude API 호출    │
  │                       │                       │  (system = CLAUDE.md) │
  │                       │◀─8 A 초안 업로드──────│                       │
  │                       │                       │                       │
  │                       │──9 A + 요약 알림─────────────────────────────▶│
  │                       │                       │                       │
  │                       │◀─10 B 답변 작성·전송──────────────────────────│
  │                       │                       │                       │
  │                       │──11 A vs B diff 계산                          │
  │                       │──12 diff 저장 (learning_examples)             │
  │                       │                       │                       │
  │                       │  ──월 1회──▶  13 격차 패턴 분석                │
  │                       │                       │                       │
  │◀─14 최종 B 발송────────│                       │                       │
```

### 2-2. 구성 요소

| 컴포넌트 | 위치 | 역할 | 기술 |
|---------|------|-----|------|
| 챗봇 | Vercel Edge | 고객 맥락 정리 | Claude Haiku API |
| 의뢰폼·결제 | Vercel + Toss | 의뢰 접수 | 기존 |
| **의뢰 webhook** | **Vercel → Mac** | **접수 알림** | **Ngrok or Cloudflare Tunnel** |
| **자문봇 워커** | **Mac 로컬 상시 실행** | **A 초안 생성** | **Python + Claude Sonnet API** |
| HRer_DB | Mac 로컬 SQLite | 24만 건 지식 | 기존 |
| Supabase | 클라우드 | B 답변·A 초안 저장·diff 저장 | 기존 |
| **diff 엔진** | **Vercel Edge 또는 Mac** | **A vs B 비교** | **embedding + 문자열 diff** |
| 대시보드 | Vercel | A 확인·B 작성 | 기존 + 보강 |
| **학습 집계기** | **Mac 월 1회** | **격차 패턴 추출** | **Python 스크립트** |

## 3. 단계별 상세

### 3-1. 의뢰 접수 → 자문봇 트리거

**트리거 방식 (3가지 선택지):**

**방식 A. Webhook (실시간)**
- Mac에 Cloudflare Tunnel 또는 Ngrok 상시 실행
- Vercel에서 order 저장 직후 Mac의 `/trigger` 엔드포인트 호출
- 장점: 즉시 반응 / 단점: Mac이 24시간 켜져 있어야 함

**방식 B. Polling (주기적)**
- Mac의 cron이 1분마다 Supabase `orders` 테이블 조회
- `ai_draft IS NULL AND payment_status='paid'` 조건으로 신규 건 탐색
- 장점: 인프라 단순 / 단점: 최대 1분 지연

**방식 C. Push 알림 + 수동 실행**
- 의뢰 접수 시 텔레그램 알림만 발송
- 윤지민이 텔레그램에서 버튼 누르면 Mac에서 자문봇 실행
- 장점: Mac 끄고 외출 가능 / 단점: 자동화 아님

**권고: 방식 B (Polling)**
- Mac이 꺼져 있어도 켜질 때 누락분 자동 처리됨
- 인프라 복잡도 낮음 (Cloudflare Tunnel 불필요)
- 1분 지연은 실무 문제 없음 (어차피 윤지민이 보는 건 수시간 후)

**구현:**
```python
# scheduled_advisor_worker.py (Mac, cron: * * * * *)
import time, os
from supabase import get_pending_orders, update_order
from advisor_bot import generate_draft

orders = get_pending_orders()  # ai_draft is null AND paid
for o in orders[:5]:  # 한 번에 5건까지
    draft = generate_draft(
        service=o['service'],
        tier=o['tier'],
        question=o['question'],
        handoff_summary=o['handoff_summary'],
    )
    update_order(o['id'], {
        'ai_draft': draft['body'],
        'ai_draft_at': now(),
        'ai_draft_citations': draft['citations'],
        'ai_draft_model': 'claude-sonnet-4-6',
    })
    notify_telegram(f"자문봇 초안 생성 완료: {o['name']} / {o['service']}")
```

### 3-2. 자문봇 내부 구조

**Step 1. 질문 분석**
- 유형 A(단순 법/제도) vs B(복잡 쟁점) 자동 분류
- 주제 태깅 (해고/임금/괴롭힘/평가/규정 등)
- 쟁점 목록 추출

**Step 2. RAG 검색 (HRer_DB.sqlite)**
우선순위 순으로 병렬 검색:
```
1. 자문패턴 테이블에서 동일 주제분류 top-5 (유사도)
2. 이메일 최종발송본 top-5 (유사도)
3. 행정해석 top-10 (FTS)
4. 판례 top-5 (FTS)
5. 법령 조문 top-5 (법령명 매칭)
```
총 30건 컨텍스트 → 토큰 절약 위해 요약 스니펫만 넣기

**Step 3. 프롬프트 조립**
```
System: <CLAUDE.md 전체 내용>
       + <MODE_자문.md>
       + <RULES_인용형식.md>
       + <윤지민 톤·스타일 규칙>

User: # 의뢰 정보
      서비스: {service}
      등급: {tier}
      회사: {company}
      질문: {question}

      # 챗봇 요약
      {handoff_summary}

      # RAG 컨텍스트
      ## 유사 자문 (자문패턴)
      [1] Q: ... / A: ...
      [2] ...

      ## 최종발송본 유사 사례
      [1] 제목: ... / 답변 요지: ...

      ## 관련 행정해석
      [1] 번호 ... 날짜 ... / 본문: ...

      ## 관련 판례
      [1] 사건번호 / 판시사항 / 판결요지

      ## 관련 법령
      [1] 근로기준법 제X조 ...

      # 지시
      위 데이터를 참고하여 윤지민 노무사 스타일로 자문 답변 초안을 작성하세요.
      - 사실관계 정리 → 법적 근거 → 판례·행정해석 인용 → 결론 → 실무 권고
      - 인용 근거는 실존하는 것만 (확인 불가 시 '확인 필요' 표시)
      - 합쇼체 + 줄글, 위험회피적 말투
      - 서명: 'HRer 노무사 윤지민 드림'
```

**Step 4. 호출 + 검증**
```python
response = claude.messages.create(
    model='claude-sonnet-4-6',
    max_tokens=4000,
    system=SYSTEM_PROMPT,
    messages=[{'role':'user', 'content': USER_PROMPT}],
)
draft = response.content[0].text

# verify_citations.py 자동 실행 (기존 도구 재사용)
verified = verify_citations(draft)
if verified['unverified_count'] > 0:
    # 미확인 인용 표시로 바꿈
    draft = mark_unverified(draft, verified['items'])

# 자기반박 검증 (옵션, 정밀 모드일 때만)
if tier in ('deep','written'):
    draft = self_critique_revise(draft)
```

**Step 5. Supabase에 업로드**
- `orders.ai_draft` = 본문
- `orders.ai_draft_at` = 타임스탬프
- `orders.ai_draft_citations` = JSON (인용 근거 목록)
- `orders.ai_draft_model` = 모델명·버전

### 3-3. 윤지민 B 답변 작성 (이미 구현됨)

- 대시보드 → 의뢰 클릭 → 답변 모달
- **추가 필요**: A 초안을 모달 상단에 '참고 영역'으로 표시 + '참고해서 시작' 버튼

**UI 보강:**
```
[답변 모달]
├─ 의뢰 정보 카드 (기존)
├─ 챗봇 요약 카드 (기존)
├─ ★ 자문봇 초안 A (신규) ─ 접기/펼치기
│   ├─ 인용 근거 뱃지들 (판례·행정해석·법령)
│   ├─ 본문 (스크롤)
│   └─ [A를 에디터로 복사] 버튼
├─ 발송 채널 토글 (기존)
├─ 답변 에디터 (B 작성)
└─ 전송 버튼 → A vs B 자동 diff → Supabase 저장
```

### 3-4. A vs B Diff 계산

**측정 지표 3가지:**

**1. 의미 유사도 (Semantic Similarity)**
- A와 B를 각각 embedding (Claude Voyage 또는 OpenAI text-embedding-3-small)
- cosine similarity 0~1
- 0.9+ = A가 B에 매우 근접 (거의 그대로 채택)
- 0.5~0.9 = 부분 참고
- 0.5 미만 = A를 거의 버림

**2. 인용 채택률 (Citation Adoption Rate)**
- A의 인용 근거 목록 vs B의 인용 근거 목록
- B에 그대로 들어간 것 / A 총 인용 수 = 0~1
- 높으면 RAG가 제대로 작동

**3. 구조 차이 (Structural Diff)**
- 문단 단위 diff (각 문단이 추가·삭제·수정·유지 중 무엇인지)
- A→B 변환 패턴: '추가된 표현', '삭제된 표현', '치환된 표현'

**저장:**
```sql
create table learning_examples (
  id bigserial primary key,
  order_id uuid references orders(id),
  a_body text,               -- 자문봇 초안
  b_body text,               -- 윤지민 최종
  similarity float,          -- 0.0~1.0
  citation_adoption float,   -- 0.0~1.0
  a_citations jsonb,
  b_citations jsonb,
  diff_chunks jsonb,         -- 문단별 diff
  topic text,                -- 주제 분류
  service text,
  tier text,
  model_version text,        -- A 생성 모델
  created_at timestamptz default now()
);
```

### 3-5. 학습 집계 (월 1회)

**스크립트: `analyze_gap.py`**

```python
# 최근 30일 learning_examples 분석
examples = load_recent_examples(days=30)

# 1. 주제별 평균 유사도
gap_by_topic = groupby_topic(examples, 'similarity')
# {'해고': 0.87, '괴롭힘': 0.72, '임금': 0.91, ...}

# 2. 가장 자주 삭제된 표현
frequent_deletions = extract_frequent_diff(examples, 'del')
# ['~을 추천드립니다', '이상입니다', ...]

# 3. 가장 자주 추가된 표현
frequent_additions = extract_frequent_diff(examples, 'add')
# ['다만 회사 규모를 고려하여', '판단 필요', ...]

# 4. 버려진 인용 (A엔 있었는데 B엔 없는 것)
dropped_citations = extract_dropped_citations(examples)
# [{'판례':'2020다12345', 'count':5}, ...]
# → 이 판례가 자주 버려지는 이유 파악

# 5. 자주 채택된 인용
adopted_citations = extract_adopted_citations(examples)
# [{'행정해석':'근기68207-123', 'count':12}, ...]
# → RAG 가중치 올려야 할 근거

# 리포트 생성 + 텔레그램 발송
report = render_gap_report(gap_by_topic, frequent_deletions, ...)
save_to_file(f'./output/gap_report_{today}.md')
telegram_notify(report)
```

**윤지민이 월 1회 리포트 확인 후:**
- "이 표현은 계속 빼기" → CLAUDE.md 또는 자문봇 system prompt에 반영
- "이 판례는 자주 안 쓰니까 RAG에서 가중치 낮추자" → retrieval 파라미터 조정
- "이 주제에선 A가 계속 헛짚음" → 해당 주제 전용 few-shot 예시 추가

## 4. 프롬프트 진화 전략

### 4-1. 단계적 접근

**Phase 1 (첫 1~2개월, 자문 건수 10건 미만)**
- CLAUDE.md 전체를 system prompt로 그대로 투입
- Few-shot 없이 시작
- 목표: 베이스라인 측정

**Phase 2 (3~6개월, 자문 건수 30~100건)**
- 주제별로 B 답변 3~5건씩 Few-shot 예시 삽입
- 자주 삭제되는 표현을 '금지 표현'으로 system prompt에 추가
- 자주 추가되는 표현을 '권장 패턴'으로 추가

**Phase 3 (6개월+, 자문 건수 100건+)**
- 주제별 전용 프롬프트 분기 (해고·괴롭힘·규정·평가 등)
- Fine-tuning 검토 (Claude API가 지원할 경우)
- 또는 RAG에 윤지민 답변 B를 직접 색인 → 유사 질문 시 B를 참조

### 4-2. 절대 하지 말 것
- B를 그대로 A에 학습시키지 말 것 (법적 판단의 맥락까지 학습 안 됨)
- 모든 의뢰에 자동 발송하지 말 것 (항상 윤지민 최종 검토 거침)
- A를 고객에게 노출시키지 말 것 (품질 책임은 B에 있음)

## 5. 비용 추산

### 5-1. Claude API 사용량 (월 기준)

**자문봇 (Sonnet)**
- 의뢰 1건당 평균 입력 8,000 토큰 + 출력 2,000 토큰
- 월 50건 의뢰 가정: 입력 400K + 출력 100K
- 비용: 400K × $3/M + 100K × $15/M = $1.20 + $1.50 = **$2.70/월**

**챗봇 (Haiku)**
- 대화 1건당 평균 입력 3,000 + 출력 800 토큰
- 월 500대화 가정: 입력 1.5M + 출력 400K
- 비용: 1.5M × $1/M + 400K × $5/M = $1.50 + $2.00 = **$3.50/월**

**Embedding (Voyage)**
- 의뢰 50건 × (A + B) × 평균 3K 토큰 = 300K 토큰
- 비용: $0.05/M × 300K = **$0.015/월** (사실상 무료)

**합계: 월 약 $6~10 (의뢰 50건 기준)**
의뢰가 100건으로 늘어도 월 $15~20 수준.

### 5-2. 인프라 비용
- Supabase: 무료 (Pro 전환 시 $25/월)
- Vercel: 무료 (Pro 전환 시 $20/월)
- Mac 상시 실행: 전기세 월 1~2만 원
- Cloudflare Tunnel: 무료

**전체: 월 3~5만 원 수준** (의뢰 건수 증가 시에도 비례 증가 크지 않음)

## 6. 구현 순서 (법인 완료 후)

### Week 1: 기반 설정
- [ ] Anthropic API 키 발급 (법인카드 등록)
- [ ] Vercel env에 `ANTHROPIC_API_KEY` 추가
- [ ] Supabase에 `learning_examples` 테이블 생성
- [ ] `orders`에 `ai_draft_citations`, `ai_draft_model` 컬럼 추가

### Week 2: 챗봇 → Claude 전환
- [ ] `api/chat.js` Anthropic SSE로 교체
- [ ] Gemini 폴백 코드 유지 (이중화)
- [ ] `api/summarize.js` 교체
- [ ] 테스트 + 배포

### Week 3: 자문봇 워커
- [ ] `advisor_bot.py` Mac 로컬 구축 (CLAUDE.md + MODE_자문.md 로드)
- [ ] RAG 검색 통합 (기존 search_db.py 재사용)
- [ ] verify_citations 통합
- [ ] Supabase polling 스크립트
- [ ] cron 등록 (매 분 실행)

### Week 4: A vs B Diff
- [ ] `api/answer.js`에 diff 계산 로직 추가
- [ ] Embedding 호출 (Voyage API)
- [ ] `learning_examples` 저장
- [ ] 대시보드에 A 표시 영역 추가

### Month 2+: 집계·개선 루프
- [ ] `analyze_gap.py` 작성
- [ ] 월 1회 cron 등록
- [ ] 첫 격차 리포트 검토
- [ ] Few-shot 예시 반영 → system prompt 업데이트
- [ ] 반복

## 7. 리스크와 대응

| 리스크 | 영향 | 대응 |
|-------|-----|------|
| A 품질이 너무 낮음 | 초안 참고 가치 없음 | CLAUDE.md 프롬프트 강화, RAG top-k 늘리기, Sonnet 대신 Opus 검토 |
| 인용 환각 (가짜 판례) | 잘못된 법적 근거 | verify_citations 강제 실행, 실패 시 '확인 필요' 강제 표시 |
| Mac이 꺼져 있을 때 지연 | A 생성 지연 | Polling으로 누락분 자동 처리, 중요 건만 Cloudflare로 push |
| Claude API 장애 | 자문봇 중단 | Gemini 폴백 유지 |
| B 작성 패턴이 불일정 | 학습 수렴 느림 | 주제별로 분리 학습, 장기 모니터링 |
| 개인정보 노출 | 법적 리스크 | 이름·사번·주민번호 등 자동 마스킹 전처리 |

## 8. 법적·윤리 체크포인트

- A를 **절대 고객에게 직접 전달하지 않음** (공인노무사법상 자문 주체는 사람)
- 모든 B는 윤지민이 확인·서명
- A는 내부 참고자료로만 기록
- 고객 의뢰 내용 저장 고지 필요 (개인정보처리방침에 명시)
- 학습 데이터는 익명화 후 사용 (실제 구현 시 이름·회사명 등 마스킹)

## 9. 현 시점 체크리스트 (이미 완료된 것)

- ✅ Supabase 기반 의뢰·답변 저장
- ✅ 대시보드 답변 작성 UI (hrer/원팀커넥트 이중 채널)
- ✅ `orders.ai_draft`, `ai_draft_at` 컬럼 준비 완료
- ✅ HRer_DB 24만 건 (자문패턴·판례·행정해석 등)
- ✅ verify_citations.py, check_consistency.py 도구
- ✅ MODE_자문.md, RULES_*.md 규칙 파일
- ✅ 챗봇 핸드오프 요약 Supabase 저장

## 10. 다음 의사결정 지점

법인 완료 시점에 아래를 다시 확정:

1. **모델 선택**: Sonnet 4.6 vs Opus 4.6 (자문 품질 vs 비용)
2. **트리거 방식**: Polling(기본) vs Webhook(더 빠름)
3. **Few-shot 초기 데이터**: 자문패턴 1,946건 중 어떤 것을 골라 초기 예시로 쓸 것인가
4. **자가 검증 강도**: 간단 자문도 자기반박 검증 돌릴지 여부 (비용 2배)
5. **diff 가중치**: 유사도 vs 인용 채택률 중 어느 걸 주요 KPI로 볼지

---

**이 문서는 법인 설립 + 법인카드 발급 완료 시점에 구현 기반 자료로 사용.**
업데이트 이력: 2026-04-19 최초 작성.
