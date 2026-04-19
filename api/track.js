/*!
 * HRer 유입 추적 API — 페이지뷰·챗봇 이벤트 수집
 * Edge Runtime, Tokyo
 * 프라이버시 최소화:
 *   - IP는 SHA-256(ip + 날짜 salt)로 해시만 저장 (일간 unique 카운트용)
 *   - 쿠키 X, localStorage session_id만 사용
 */
import {dbInsert} from './_db.js';

export const config = {runtime: 'edge', regions: ['hnd1']};

export default async function handler(req){
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, {status:200, headers});
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'method_not_allowed'}), {status:405, headers});

  let body;
  try { body = await req.json(); } catch(e){ return new Response(JSON.stringify({ok:false}), {status:400, headers}); }

  const {type, sessionId, path, referrer, utm, chatSessionToken, event, meta} = body;
  if (!sessionId) return new Response(JSON.stringify({ok:false}), {status:400, headers});

  // Vercel Edge 헤더에서 지역·IP 추출
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
  const country = req.headers.get('x-vercel-ip-country') || null;
  const userAgent = req.headers.get('user-agent') || '';
  const device = detectDevice(userAgent);
  const ipHash = ip ? await sha256(ip + ':' + new Date().toISOString().slice(0,10) + ':hrer') : null;
  const referrerHost = extractHost(referrer || '');

  try {
    if (type === 'pageview'){
      await dbInsert('page_views', {
        session_id: sessionId,
        path: (path || '/').slice(0, 200),
        referrer: (referrer || '').slice(0, 500),
        referrer_host: referrerHost,
        utm_source: utm?.source || null,
        utm_medium: utm?.medium || null,
        utm_campaign: utm?.campaign || null,
        utm_content: utm?.content || null,
        utm_term: utm?.term || null,
        user_agent: userAgent.slice(0, 200),
        device,
        country,
        ip_hash: ipHash,
      }).catch(e => console.error('pv_fail', e.message));
    } else if (type === 'chatbot'){
      await dbInsert('chatbot_events', {
        session_id: sessionId,
        chat_session_token: chatSessionToken || null,
        event: (event || 'unknown').slice(0, 40),
        path: (path || '').slice(0, 200),
        utm_source: utm?.source || null,
        utm_campaign: utm?.campaign || null,
        meta: meta || null,
      }).catch(e => console.error('ce_fail', e.message));
    }
  } catch(e){
    console.error('track_err', e.message);
  }

  return new Response(JSON.stringify({ok:true}), {status:200, headers});
}

async function sha256(s){
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function extractHost(url){
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch(e){ return null; }
}

function detectDevice(ua){
  if (!ua) return 'unknown';
  const s = ua.toLowerCase();
  if (/tablet|ipad/.test(s)) return 'tablet';
  if (/mobile|android|iphone|ipod/.test(s)) return 'mobile';
  return 'desktop';
}
