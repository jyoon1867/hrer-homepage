-- =================================================================
-- HRer 스키마 v4: 자문봇 학습 루프용 테이블·컬럼
-- 실행 방법: Supabase SQL Editor에 붙여넣고 Run
-- v1·v2·v3 이미 적용된 상태에서 이것만 추가
-- =================================================================

-- orders에 자문봇 초안·검증 결과 컬럼 보강
alter table orders add column if not exists ai_citations jsonb;      -- 자문봇이 뽑은 인용 근거
alter table orders add column if not exists ai_model text;           -- 'claude-sonnet-4-6' 등
alter table orders add column if not exists ai_input_tokens int;
alter table orders add column if not exists ai_output_tokens int;
alter table orders add column if not exists ai_verified jsonb;       -- verify_citations 결과
alter table orders add column if not exists response_citations jsonb; -- B(윤지민)가 인용한 근거 (파서로 추출)

-- 학습 예시 테이블: A vs B 격차 저장
create table if not exists learning_examples (
  id bigserial primary key,
  order_id uuid references orders(id) on delete cascade,
  topic text,                          -- taxonomy_id (대분류)
  topic_sub text,                      -- 세부태그 (해고.수습해고 등)
  service text,
  tier text,

  -- 원본
  a_body text,                         -- 자문봇 초안
  b_body text,                         -- 윤지민 최종 답변
  a_citations jsonb,
  b_citations jsonb,

  -- diff 측정값 (advisor_bot.diff.compare 출력)
  similarity float,                    -- 0.0~1.0
  length_ratio float,                  -- B/A 길이 비율
  citation_adoption_rate float,        -- 전체 인용 채택률
  citation_adoption_detail jsonb,      -- 법령·판례·행정해석별 세부
  paragraph_stats jsonb,               -- kept/replaced/added/deleted 개수
  paragraph_chunks jsonb,              -- 문단별 op 목록 (기록용)
  style_markers jsonb,                 -- 톤 마커 차이

  -- 메타
  ai_model text,
  b_author text,                       -- 'HRer' 또는 담당자 식별자
  created_at timestamptz default now()
);

create index if not exists idx_learning_topic on learning_examples(topic);
create index if not exists idx_learning_created on learning_examples(created_at desc);
create index if not exists idx_learning_similarity on learning_examples(similarity);

alter table learning_examples enable row level security;
