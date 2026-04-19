-- =================================================================
-- HRer 스키마 v5: 유입 추적(Analytics) 레이어
-- 실행: Supabase SQL Editor에 붙여넣고 Run
-- v1~v4 적용된 상태에서 이것만 추가
-- =================================================================

-- 모든 페이지 뷰 기록 (IP 해시 처리, 개인정보 최소 수집)
create table if not exists page_views (
  id bigserial primary key,
  session_id text,               -- 클라이언트 생성 세션 ID (localStorage, 24h 유지)
  path text,                     -- '/', '/consultation', '/order' 등
  referrer text,                 -- 이전 페이지 (외부 유입일 때 검색엔진·소셜)
  referrer_host text,            -- 도메인만 추출 (naver.com, google.com, tistory.com 등)
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  user_agent text,
  device text,                    -- 'mobile' | 'desktop' | 'tablet' (UA 기반 간이 분류)
  country text,                   -- 'KR' 등 (Vercel geo 헤더)
  ip_hash text,                   -- SHA-256(ip + 날짜 salt) — 개인식별 불가, 일간 unique 카운트용
  created_at timestamptz default now()
);

create index if not exists idx_pv_created on page_views(created_at desc);
create index if not exists idx_pv_path on page_views(path);
create index if not exists idx_pv_source on page_views(utm_source);
create index if not exists idx_pv_ref_host on page_views(referrer_host);
create index if not exists idx_pv_session on page_views(session_id, created_at);

alter table page_views enable row level security;

-- 챗봇 오픈 이벤트 (어느 페이지에서 챗봇 열었는지 측정)
create table if not exists chatbot_events (
  id bigserial primary key,
  session_id text,
  chat_session_token text,
  event text,                     -- 'open', 'send_message', 'handoff', 'close'
  path text,                      -- 어느 페이지에서 발생
  utm_source text,
  utm_campaign text,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_ce_created on chatbot_events(created_at desc);
create index if not exists idx_ce_event on chatbot_events(event);
create index if not exists idx_ce_source on chatbot_events(utm_source);

alter table chatbot_events enable row level security;

-- 일간 집계 뷰 (대시보드용)
create or replace view v_daily_channel_stats as
select
  date_trunc('day', pv.created_at)::date as day,
  coalesce(pv.utm_source, pv.referrer_host, '(direct)') as source,
  count(distinct pv.session_id) as unique_visitors,
  count(*) as page_views,
  count(distinct case when pv.path in ('/', '/consultation', '/unfair-dismissal', '/investigation', '/hr-evaluation', '/employment-rules') then pv.session_id end) as landing_visitors
from page_views pv
group by 1, 2
order by 1 desc, 3 desc;

-- 주간 채널 성과 뷰 (유입→챗봇→의뢰 전환)
create or replace view v_weekly_funnel as
select
  date_trunc('week', pv.created_at)::date as week,
  coalesce(pv.utm_source, pv.referrer_host, '(direct)') as source,
  count(distinct pv.session_id) as visitors,
  count(distinct ce.session_id) as chatbot_openers,
  count(distinct o.id) as orders,
  count(distinct case when o.payment_status = 'paid' then o.id end) as paid_orders,
  round(100.0 * count(distinct ce.session_id) / nullif(count(distinct pv.session_id), 0), 2) as chat_open_rate,
  round(100.0 * count(distinct o.id) / nullif(count(distinct pv.session_id), 0), 2) as order_rate
from page_views pv
left join chatbot_events ce on ce.session_id = pv.session_id and ce.event = 'open'
left join orders o on o.utm_source = pv.utm_source and date_trunc('week', o.created_at) = date_trunc('week', pv.created_at)
where pv.created_at > now() - interval '60 days'
group by 1, 2
order by 1 desc, 3 desc;
