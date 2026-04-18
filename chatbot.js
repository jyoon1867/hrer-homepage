/*!
 * HRer CS Chatbot — 하이브리드 (FAQ + 의뢰 유도)
 * 데이터: /chatbot-data.json (수정 시 챗봇 응답 자동 반영)
 * 전 페이지 공통 로드. DOMContentLoaded 자동 초기화.
 */
(function(){
  'use strict';
  if (window.__HRER_BOT__) return;
  window.__HRER_BOT__ = true;

  const DATA_URL = '/chatbot-data.json?v=' + Date.now();
  let DATA = null;

  // ============================================================
  // MATCHING
  // ============================================================
  function matchFAQ(text){
    if (!DATA || !DATA.faq) return null;
    const q = text.trim().toLowerCase().replace(/\s+/g,'');
    if (!q) return null;
    let best = null, bestScore = 0;
    DATA.faq.forEach(f => {
      let score = 0;
      const fullQ = f.q.toLowerCase().replace(/\s+/g,'');
      if (fullQ === q) score += 100;
      (f.kws||[]).forEach(k => {
        if (q.includes(k.toLowerCase())) score += k.length >= 3 ? 3 : 2;
      });
      if (score > bestScore){ bestScore = score; best = f; }
    });
    return bestScore >= 2 ? best : null;
  }

  function needsEscalation(text){
    if (!DATA || !DATA.escalate) return false;
    const t = text.toLowerCase();
    const kws = DATA.escalate.keywords || [];
    const minLen = DATA.escalate.min_length || 15;
    return kws.some(k => t.includes(k.toLowerCase())) && text.length >= minLen;
  }

  // ============================================================
  // UI
  // ============================================================
  const CSS = `
  .hrbot-fab{position:fixed;right:22px;bottom:22px;z-index:9998;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#00B893 0%,#4C6EF5 100%);color:#fff;border:none;cursor:pointer;box-shadow:0 10px 30px rgba(0,184,147,0.35);display:flex;align-items:center;justify-content:center;font-size:24px;transition:transform 0.2s,box-shadow 0.2s;font-family:inherit}
  .hrbot-fab:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(0,184,147,0.45)}
  .hrbot-fab .hrbot-pulse{position:absolute;inset:-2px;border-radius:50%;border:2px solid #00B893;opacity:0.6;animation:hrbot-pulse 2s infinite;pointer-events:none}
  @keyframes hrbot-pulse{0%{transform:scale(1);opacity:0.6}100%{transform:scale(1.3);opacity:0}}
  .hrbot-badge{position:absolute;top:-4px;right:-4px;background:#FF3B30;color:#fff;border-radius:50%;width:20px;height:20px;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
  .hrbot-win{position:fixed;right:22px;bottom:94px;z-index:9999;width:380px;max-width:calc(100vw - 30px);height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,0.25);display:none;flex-direction:column;overflow:hidden;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;animation:hrbot-pop 0.2s}
  .hrbot-win.open{display:flex}
  @keyframes hrbot-pop{from{opacity:0;transform:translateY(10px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
  .hrbot-head{background:linear-gradient(135deg,#191919 0%,#2a2a2a 100%);color:#fff;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .hrbot-head h4{margin:0;font-size:15px;font-weight:800;letter-spacing:-0.3px;display:flex;align-items:center;gap:8px}
  .hrbot-head .dot{width:8px;height:8px;border-radius:50%;background:#00B893;animation:hrbot-dot 1.8s infinite}
  @keyframes hrbot-dot{0%,100%{box-shadow:0 0 0 0 rgba(0,184,147,0)}70%{box-shadow:0 0 0 8px rgba(0,184,147,0.4)}}
  .hrbot-head .sub{font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px;font-weight:500}
  .hrbot-head button{background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:20px;padding:4px 8px;border-radius:6px;line-height:1;transition:background 0.15s;font-family:inherit}
  .hrbot-head button:hover{background:rgba(255,255,255,0.1);color:#fff}
  .hrbot-body{flex:1;overflow-y:auto;padding:18px;background:#FAFAFA;scroll-behavior:smooth}
  .hrbot-body::-webkit-scrollbar{width:6px}
  .hrbot-body::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:3px}
  .hrbot-msg{display:flex;margin-bottom:12px;animation:hrbot-fade 0.25s}
  @keyframes hrbot-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .hrbot-msg.bot .hrbot-bubble{background:#fff;color:#191919;border:1px solid #E5E7EB;border-radius:4px 14px 14px 14px;max-width:85%}
  .hrbot-msg.user{justify-content:flex-end}
  .hrbot-msg.user .hrbot-bubble{background:linear-gradient(135deg,#00B893,#4C6EF5);color:#fff;border-radius:14px 14px 4px 14px;max-width:80%}
  .hrbot-bubble{padding:11px 14px;font-size:13.5px;line-height:1.7;font-weight:500;word-break:break-word}
  .hrbot-bubble em{color:#00B893;font-style:normal;font-weight:700}
  .hrbot-msg.user .hrbot-bubble em{color:#fff;text-decoration:underline}
  .hrbot-bubble a{color:#4C6EF5;text-decoration:underline;font-weight:700}
  .hrbot-msg.user .hrbot-bubble a{color:#fff}
  .hrbot-chips{display:flex;flex-direction:column;gap:6px;margin:6px 0 12px;align-items:flex-start}
  .hrbot-chip{background:#fff;border:1px solid #D1D5DB;color:#374151;font-size:12.5px;padding:8px 12px;border-radius:16px;cursor:pointer;transition:all 0.15s;font-family:inherit;font-weight:500;text-align:left;line-height:1.4;max-width:100%}
  .hrbot-chip:hover{border-color:#00B893;color:#00B893;background:#F0FDF4}
  .hrbot-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}
  .hrbot-action{background:#00B893;color:#fff;font-size:12.5px;padding:9px 14px;border-radius:10px;text-decoration:none;font-weight:700;transition:opacity 0.15s;display:inline-block}
  .hrbot-action:hover{opacity:0.88;color:#fff}
  .hrbot-action.ghost{background:#fff;color:#00B893;border:1.5px solid #00B893}
  .hrbot-action.ghost:hover{background:#F0FDF4}
  .hrbot-typing{display:flex;gap:3px;padding:12px 16px;background:#fff;border:1px solid #E5E7EB;border-radius:4px 14px 14px 14px;width:fit-content;margin-bottom:12px}
  .hrbot-typing span{width:6px;height:6px;background:#9CA3AF;border-radius:50%;animation:hrbot-typing 1.2s infinite}
  .hrbot-typing span:nth-child(2){animation-delay:0.15s}
  .hrbot-typing span:nth-child(3){animation-delay:0.3s}
  @keyframes hrbot-typing{0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-4px);opacity:1}}
  .hrbot-input{padding:12px;background:#fff;border-top:1px solid #E5E7EB;display:flex;gap:8px}
  .hrbot-input input{flex:1;padding:11px 14px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:14px;font-family:inherit;outline:none;transition:border-color 0.15s;font-weight:500}
  .hrbot-input input:focus{border-color:#00B893}
  .hrbot-input button{background:#191919;color:#fff;border:none;padding:0 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity 0.15s}
  .hrbot-input button:hover{opacity:0.85}
  .hrbot-footer{padding:8px 14px;background:#fff;border-top:1px solid #F3F4F6;font-size:10.5px;color:#9CA3AF;text-align:center;line-height:1.5}
  @media(max-width:480px){
    .hrbot-win{right:10px;left:10px;bottom:82px;width:auto;height:70vh}
    .hrbot-fab{right:14px;bottom:14px;width:54px;height:54px;font-size:22px}
  }
  `;

  function h(tag, attrs, children){
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs){
      if (k === 'onClick') el.addEventListener('click', attrs[k]);
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(el.style, attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children)?children:[children]).forEach(c => {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function init(){
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const fab = h('button', {'class':'hrbot-fab','aria-label':'상담봇 열기','onClick':toggle},
      [h('span',{'class':'hrbot-pulse'}),'💬',h('span',{'class':'hrbot-badge'},'1')]);
    document.body.appendChild(fab);

    const body = h('div', {'class':'hrbot-body'});
    const win = h('div', {'class':'hrbot-win','role':'dialog','aria-label':'HRer 상담봇'}, [
      h('div', {'class':'hrbot-head'}, [
        h('div', null, [
          h('h4', null, [h('span',{'class':'dot'}), 'HRer 상담봇']),
          h('div', {'class':'sub'}, '공인노무사 운영 · 24만 건 DB 기반')
        ]),
        h('button', {'aria-label':'닫기','onClick':close}, '×')
      ]),
      body,
      h('form', {'class':'hrbot-input'},
        [
          h('input',{'type':'text','placeholder':'궁금한 점을 편하게 물어보세요','id':'hrbot-input','autocomplete':'off'}),
          h('button',{'type':'submit'},'전송')
        ]
      ),
      h('div',{'class':'hrbot-footer','html':'* 일반 정보 안내용. 구체 법률 판단은 <a href="/order" style="color:#4C6EF5;font-weight:700">자문 의뢰</a>를 이용해 주세요.'})
    ]);
    document.body.appendChild(win);

    const form = win.querySelector('form');
    const input = win.querySelector('#hrbot-input');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      addUserMsg(v);
      input.value = '';
      setTimeout(()=>respond(v), 400 + Math.random()*300);
    });

    function scrollBottom(){ body.scrollTop = body.scrollHeight; }
    function addBotMsg(html){
      const m = h('div',{'class':'hrbot-msg bot'}, h('div',{'class':'hrbot-bubble','html':html}));
      body.appendChild(m); scrollBottom();
    }
    function addUserMsg(text){
      const m = h('div',{'class':'hrbot-msg user'}, h('div',{'class':'hrbot-bubble'}, text));
      body.appendChild(m); scrollBottom();
    }
    function addTyping(){
      const t = h('div',{'class':'hrbot-typing','id':'hrbot-t'},[h('span'),h('span'),h('span')]);
      body.appendChild(t); scrollBottom();
    }
    function removeTyping(){
      const t = document.getElementById('hrbot-t');
      if (t) t.remove();
    }
    function addSuggestions(list){
      if (!list || !list.length) return;
      const wrap = h('div',{'class':'hrbot-chips'});
      list.forEach(s => {
        const c = h('button',{'class':'hrbot-chip','type':'button','onClick':()=>{
          wrap.remove();
          addUserMsg(s);
          setTimeout(()=>respond(s), 400);
        }}, s);
        wrap.appendChild(c);
      });
      body.appendChild(wrap); scrollBottom();
    }
    function addActions(actions){
      if (!actions || !actions.length) return;
      const wrap = h('div',{'class':'hrbot-actions'});
      actions.forEach(a => {
        const el = h('a',{'class':'hrbot-action'+(a.ghost?' ghost':''),'href':a.href}, a.label);
        wrap.appendChild(el);
      });
      body.appendChild(wrap); scrollBottom();
    }
    function respond(text){
      addTyping();
      setTimeout(()=>{
        removeTyping();
        if (!DATA){
          addBotMsg('잠시만요, 데이터를 불러오는 중이에요… 다시 한번 입력해 주세요.');
          return;
        }
        if (needsEscalation(text)){
          addBotMsg(DATA.escalate.message);
          addActions(DATA.escalate.actions);
          return;
        }
        const m = matchFAQ(text);
        if (m){ addBotMsg(m.a); return; }
        addBotMsg(DATA.fallback.text);
        if (DATA.fallback.use_quick_suggestions) addSuggestions(DATA.quick_suggestions);
        addActions(DATA.fallback.actions);
      }, 500 + Math.random()*400);
    }

    // 데이터 로드
    fetch(DATA_URL).then(r => r.json()).then(d => {
      DATA = d;
      setTimeout(()=>{
        addBotMsg(d.greeting.text);
        if (d.greeting.use_quick_suggestions) addSuggestions(d.quick_suggestions);
      }, 300);
    }).catch(err => {
      console.error('HRer bot data load failed', err);
      setTimeout(()=>addBotMsg('죄송합니다. 상담봇 로딩에 실패했어요. <a href="/order">자문 의뢰</a>로 직접 문의해 주세요.'), 300);
    });

    window.__hrbot_state = {open:false};
    function toggle(){
      const s = window.__hrbot_state;
      s.open = !s.open;
      win.classList.toggle('open', s.open);
      if (s.open){
        const b = fab.querySelector('.hrbot-badge');
        if (b) b.remove();
        setTimeout(()=>input.focus(), 250);
      }
    }
    function close(){
      window.__hrbot_state.open = false;
      win.classList.remove('open');
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && window.__hrbot_state.open) close();
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
