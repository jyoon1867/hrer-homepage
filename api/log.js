/*!
 * HRer 챗봇 로그 수집 (FAQ 매칭·피드백·의뢰 이벤트)
 * Edge Runtime, fire-and-forget
 */
import {logChatTurn, logFeedback, logMiss, dbUpdate, dbInsert} from './_db.js';

export const config = {
  runtime: 'edge',
  regions: ['hnd1'],
};

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
  try { body = await req.json(); } catch(e){ return new Response('{}', {status:400, headers}); }
  const userAgent = req.headers.get('user-agent') || '';
  const referer = req.headers.get('referer') || '';

  const {type, sessionToken} = body;
  if (!sessionToken) return new Response(JSON.stringify({ok:false}), {status:400, headers});

  try {
    if (type === 'faq_hit'){
      const {userMessage, botReply, matchedFAQ} = body;
      await logChatTurn({sessionToken, userAgent, referer, userMessage, botReply, mode:'faq', matchedFAQ});
    } else if (type === 'escalate'){
      const {userMessage, botReply} = body;
      await logChatTurn({sessionToken, userAgent, referer, userMessage, botReply, mode:'escalate', matchedFAQ:null});
    } else if (type === 'fallback'){
      const {userMessage, botReply} = body;
      await logChatTurn({sessionToken, userAgent, referer, userMessage, botReply, mode:'fallback', matchedFAQ:null});
      await logMiss({sessionToken, query: userMessage, aiHandled: false});
    } else if (type === 'feedback'){
      const {faqId, query, up, note} = body;
      await logFeedback({sessionToken, faqId, query, up, note});
    } else if (type === 'handoff'){
      const {service, summary} = body;
      await dbUpdate('chat_sessions', {session_token: sessionToken}, {
        handoff_to: service,
        handoff_at: new Date().toISOString(),
      });
      // orders 사전 기록 (실제 결제 전)
      if (summary){
        await dbInsert('orders', {
          service,
          handoff_session: sessionToken,
          handoff_summary: summary,
          payment_status: 'pending',
        });
      }
    } else if (type === 'user_message'){
      // 사용자 첫 메시지만 기록 (AI로 안 감, FAQ 매칭 중)
      const {userMessage} = body;
      if (userMessage) await logChatTurn({sessionToken, userAgent, referer, userMessage, botReply: null, mode:null});
    }
  } catch(e){
    console.error('log_err', e);
  }

  return new Response(JSON.stringify({ok:true}), {status:200, headers});
}
