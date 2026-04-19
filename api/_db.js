/*!
 * Supabase REST 직접 호출 유틸 (Edge Runtime 호환, SDK 없이)
 *
 * 환경변수:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY  (서버 전용, 공개 금지)
 */

export function getSupabase(){
  const url = globalThis.process?.env?.SUPABASE_URL;
  const key = globalThis.process?.env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {url, key};
}

function headers(key){
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

export async function dbInsert(table, row){
  const s = getSupabase(); if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers(s.key),
      body: JSON.stringify(row),
    });
    if (!r.ok){
      console.error('db_insert_fail', table, r.status, await r.text().then(t=>t.slice(0,200)).catch(()=>'?'));
      return null;
    }
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  } catch(e){
    console.error('db_insert_err', table, e.message);
    return null;
  }
}

export async function dbUpsert(table, row, onConflict){
  const s = getSupabase(); if (!s) return null;
  try {
    const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
    const r = await fetch(`${s.url}/rest/v1/${table}${qs}`, {
      method: 'POST',
      headers: {...headers(s.key), 'Prefer': 'return=representation,resolution=merge-duplicates'},
      body: JSON.stringify(row),
    });
    if (!r.ok){
      console.error('db_upsert_fail', table, r.status);
      return null;
    }
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  } catch(e){
    console.error('db_upsert_err', table, e.message);
    return null;
  }
}

export async function dbUpdate(table, match, patch){
  const s = getSupabase(); if (!s) return null;
  try {
    const qs = Object.entries(match).map(([k,v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`).join('&');
    const r = await fetch(`${s.url}/rest/v1/${table}?${qs}`, {
      method: 'PATCH',
      headers: headers(s.key),
      body: JSON.stringify(patch),
    });
    if (!r.ok){
      console.error('db_update_fail', table, r.status);
      return null;
    }
    return await r.json();
  } catch(e){
    console.error('db_update_err', table, e.message);
    return null;
  }
}

export async function dbSelect(table, query = ''){
  const s = getSupabase(); if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/${table}${query ? '?'+query : ''}`, {
      method: 'GET',
      headers: headers(s.key),
    });
    if (!r.ok){
      console.error('db_select_fail', table, r.status);
      return null;
    }
    return await r.json();
  } catch(e){
    console.error('db_select_err', table, e.message);
    return null;
  }
}

// 세션 기록·메시지 저장·업데이트를 한 번에 (Edge 환경에서 fire-and-forget)
export async function logChatTurn({sessionToken, userAgent, referer, userMessage, botReply, mode, matchedFAQ}){
  const s = getSupabase(); if (!s) return;
  const now = new Date().toISOString();

  // 세션 upsert
  await dbUpsert('chat_sessions', {
    session_token: sessionToken,
    user_agent: userAgent?.slice(0, 200),
    referer: referer?.slice(0, 300),
    last_message_at: now,
  }, 'session_token').catch(()=>{});

  // 메시지 적재
  if (userMessage){
    await dbInsert('chat_messages', {
      session_token: sessionToken,
      role: 'user',
      content: userMessage.slice(0, 4000),
    }).catch(()=>{});
  }
  if (botReply){
    await dbInsert('chat_messages', {
      session_token: sessionToken,
      role: 'bot',
      content: botReply.slice(0, 4000),
      mode,
      matched_faq: matchedFAQ || null,
    }).catch(()=>{});
  }
  // message_count 증가는 RPC 없이 생략 (집계 API에서 계산)
}

export async function logMiss({sessionToken, query, aiHandled}){
  await dbInsert('chat_misses', {
    session_token: sessionToken,
    query: (query||'').slice(0, 1000),
    ai_handled: !!aiHandled,
  }).catch(()=>{});
}

export async function logFeedback({sessionToken, messageId, faqId, query, up, note}){
  await dbInsert('chat_feedback', {
    session_token: sessionToken,
    message_id: messageId || null,
    faq_id: faqId || null,
    query: (query||'').slice(0, 500),
    up: !!up,
    note: (note||'').slice(0, 1000),
  }).catch(()=>{});
}
