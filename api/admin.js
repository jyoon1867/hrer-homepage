/*!
 * HRer 관리 대시보드 조회 API
 * Edge Runtime, 인증: ADMIN_TOKEN 헤더
 */
import {dbSelect} from './_db.js';

export const config = {runtime:'edge', regions:['hnd1']};

export default async function handler(req){
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, {status:200, headers});

  // 인증
  const url = new URL(req.url);
  const token = req.headers.get('x-admin-token') || url.searchParams.get('token');
  const expected = globalThis.process?.env?.ADMIN_TOKEN;
  if (!expected){
    return new Response(JSON.stringify({error:'admin_token_not_configured'}), {status:500, headers});
  }
  if (token !== expected){
    return new Response(JSON.stringify({error:'unauthorized'}), {status:401, headers});
  }

  const view = url.searchParams.get('view') || 'overview';

  try {
    if (view === 'overview'){
      const [sessions, misses, feedback, orders] = await Promise.all([
        dbSelect('chat_sessions', 'order=last_message_at.desc&limit=100'),
        dbSelect('chat_misses', 'order=created_at.desc&limit=50'),
        dbSelect('chat_feedback', 'order=created_at.desc&limit=50'),
        dbSelect('orders', 'order=created_at.desc&limit=50'),
      ]);
      return new Response(JSON.stringify({
        sessions: sessions || [],
        misses: misses || [],
        feedback: feedback || [],
        orders: orders || [],
      }), {status:200, headers});
    }

    if (view === 'session'){
      const token = url.searchParams.get('session');
      if (!token) return new Response(JSON.stringify({error:'no_session'}), {status:400, headers});
      const messages = await dbSelect('chat_messages', `session_token=eq.${encodeURIComponent(token)}&order=created_at.asc&limit=500`);
      return new Response(JSON.stringify({messages: messages || []}), {status:200, headers});
    }

    return new Response(JSON.stringify({error:'unknown_view'}), {status:400, headers});
  } catch(e){
    return new Response(JSON.stringify({error:'server', message: String(e.message||e).slice(0,200)}), {status:500, headers});
  }
}
