/*!
 * HRer 유입 추적 클라이언트
 * - 페이지 로드 시 자동 전송 (fire-and-forget)
 * - 챗봇 오픈·메시지·핸드오프 이벤트 기록
 * - 쿠키 없음. localStorage session_id만 사용 (24시간 유효)
 *
 * 프라이버시: 개인정보처리방침 5-1조 고지 완료
 */
(function(){
  'use strict';
  if (window.__HRER_ANALYTICS_LOADED) return;
  window.__HRER_ANALYTICS_LOADED = true;

  const SESSION_KEY = 'hrer_analytics_sid';
  const UTM_KEY = 'hrer_analytics_utm';
  const SESSION_TTL = 24 * 60 * 60 * 1000; // 24h

  function getSid(){
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw){
        const d = JSON.parse(raw);
        if (d && d.id && (Date.now() - d.at < SESSION_TTL)){
          d.at = Date.now();
          localStorage.setItem(SESSION_KEY, JSON.stringify(d));
          return d.id;
        }
      }
    } catch(e){}
    const id = 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({id, at: Date.now()})); } catch(e){}
    return id;
  }

  function getUtm(){
    const qs = new URLSearchParams(location.search);
    const cur = {
      source:   qs.get('utm_source'),
      medium:   qs.get('utm_medium'),
      campaign: qs.get('utm_campaign'),
      content:  qs.get('utm_content'),
      term:     qs.get('utm_term'),
    };
    // 현재 URL에 UTM이 있으면 저장·사용, 없으면 기저장된 것 유지
    if (cur.source || cur.medium || cur.campaign){
      try { localStorage.setItem(UTM_KEY, JSON.stringify({...cur, at: Date.now()})); } catch(e){}
      return cur;
    }
    try {
      const raw = localStorage.getItem(UTM_KEY);
      if (raw){
        const d = JSON.parse(raw);
        // 30일 경과 시 만료
        if (d && (Date.now() - (d.at || 0) < 30 * 24 * 60 * 60 * 1000)){
          return {source: d.source, medium: d.medium, campaign: d.campaign, content: d.content, term: d.term};
        }
      }
    } catch(e){}
    return {};
  }

  function send(payload){
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(()=>{});
    } catch(e){}
  }

  const sessionId = getSid();
  const utm = getUtm();

  // 페이지뷰 전송
  function trackPageview(){
    send({
      type: 'pageview',
      sessionId,
      path: location.pathname,
      referrer: document.referrer || '',
      utm,
    });
  }

  // 챗봇 이벤트 전송 (전역 함수로 노출)
  window.hrerTrack = function(event, meta){
    send({
      type: 'chatbot',
      sessionId,
      path: location.pathname,
      event,
      utm,
      chatSessionToken: (window.__HRER_CHAT_SESSION_TOKEN) || null,
      meta: meta || null,
    });
  };

  // 초기 페이지뷰
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', trackPageview);
  } else {
    trackPageview();
  }

  // SPA 대응 (history API 변경 감지)
  let lastPath = location.pathname;
  const origPush = history.pushState;
  history.pushState = function(){
    origPush.apply(this, arguments);
    if (location.pathname !== lastPath){
      lastPath = location.pathname;
      setTimeout(trackPageview, 100);
    }
  };
})();
