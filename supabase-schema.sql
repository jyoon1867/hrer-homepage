-- =================================================================
-- HRer 챗봇·의뢰 데이터 수집용 Supabase 스키마
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 붙여넣고 Run
-- =================================================================

-- 1) 챗봇 대화 세션 (한 번의 대화 스레드)
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text unique not null,     -- 클라이언트 생성 UUID (localStorage 유지)
  user_agent text,
  referer text,
  first_message_at timestamptz default now(),
  last_message_at timestamptz default now(),
  message_count int default 0,
  handoff_to text,                          -- 의뢰폼으로 넘어간 경우 서비스 ('consult' 등)
  handoff_at timestamptz,
  converted_to_order boolean default false, -- 실제 결제·제출까지 간 경우
  topic text,                               -- 주제 태그 (괴롭힘/해고/평가/…)
  sentiment text,                           -- 감정 태그 (분노/불안/혼란/중립)
  created_at timestamptz default now()
);

-- 2) 개별 메시지 (사용자↔봇 turn)
create table if not exists chat_messages (
  id bigserial primary key,
  session_token text not null references chat_sessions(session_token) on delete cascade,
  role text not null check (role in ('user','bot','system')),
  content text not null,
  matched_faq text,                         -- FAQ 매칭 성공 시 FAQ id/질문
  mode text,                                 -- 'faq', 'ai', 'escalate', 'fallback'
  created_at timestamptz default now()
);

-- 3) 피드백 (👍/👎)
create table if not exists chat_feedback (
  id bigserial primary key,
  session_token text not null,
  message_id bigint references chat_messages(id) on delete cascade,
  faq_id text,
  query text,
  up boolean not null,
  note text,
  created_at timestamptz default now()
);

-- 4) 매칭 실패 질문 (FAQ 후보 풀)
create table if not exists chat_misses (
  id bigserial primary key,
  session_token text,
  query text not null,
  ai_handled boolean default false,         -- AI가 답변했는지
  created_at timestamptz default now()
);

-- 5) 의뢰폼 제출 (챗봇 핸드오프 포함)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  service text not null,                    -- 'consult','unfair-dismissal','investigation','hr-evaluation','employment-rules'
  tier text,                                -- 노무자문의 simple/deep/written
  name text,
  contact text,
  company text,
  question text,
  amount int,
  payment_status text default 'pending',   -- 'pending','paid','cancelled','refunded'
  handoff_session text references chat_sessions(session_token),
  handoff_summary jsonb,                    -- 챗봇 요약 스냅샷
  created_at timestamptz default now(),
  notified_at timestamptz                   -- 지민에게 알림 발송 시각
);

-- 인덱스
create index if not exists idx_messages_session on chat_messages(session_token, created_at);
create index if not exists idx_sessions_last on chat_sessions(last_message_at desc);
create index if not exists idx_misses_created on chat_misses(created_at desc);
create index if not exists idx_orders_created on orders(created_at desc);

-- RLS (Row Level Security) — 민감 테이블은 서비스 롤만 접근
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table chat_feedback enable row level security;
alter table chat_misses enable row level security;
alter table orders enable row level security;

-- 서비스 롤만 전체 권한 (anon 차단)
-- anon key로는 아무것도 못 읽고, 서버(API)에서 SERVICE_ROLE_KEY 사용해야 읽기/쓰기 가능
-- 별도 policy 생성하지 않음 — 즉, 기본 deny.
