/*!
 * HRer CS Chatbot v2 — 하이브리드 + 고급 CS
 * 기능: ①대화 히스토리 ②카테고리 탐색 ③서비스 추천 마법사 ④피드백 ⑤CTA 자동 ⑥영업시간 ⑦관리 대시보드 연동
 */
(function(){
  'use strict';
  if (window.__HRER_BOT__) return;
  window.__HRER_BOT__ = true;

  const DATA_URL = '/chatbot-data.json?v=' + Date.now();
  const STORAGE_KEY = 'hrer_bot_history';
  const STATS_KEY = 'hrer_bot_stats';
  const MAX_HISTORY = 50;
  let DATA = null, body, input, fab, win;
  let consecutiveMisses = 0;

  // ============================================================
  // STORAGE
  // ============================================================
  function saveHistory(msgs){
    try {
      const trimmed = msgs.slice(-MAX_HISTORY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({at: Date.now(), msgs: trimmed}));
    } catch(e){}
  }
  function loadHistory(){
    try {
      const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!d) return null;
      // 7일 이상 된 히스토리는 폐기
      if (Date.now() - d.at > 7*24*3600*1000) return null;
      return d.msgs || null;
    } catch(e){ return null; }
  }
  function clearHistory(){
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
  }
  // stats: 질문·매칭실패·피드백 수집
  function recordStat(type, payload){
    try {
      const s = JSON.parse(localStorage.getItem(STATS_KEY) || '{"queries":[],"misses":[],"feedback":[]}');
      const entry = {t: Date.now(), ...payload};
      if (type === 'query') s.queries.push(entry);
      else if (type === 'miss') s.misses.push(entry);
      else if (type === 'feedback') s.feedback.push(entry);
      // 최근 500개만 보관
      ['queries','misses','feedback'].forEach(k => { if (s[k].length > 500) s[k] = s[k].slice(-500); });
      localStorage.setItem(STATS_KEY, JSON.stringify(s));
    } catch(e){}
  }

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
      if (f.q.toLowerCase().replace(/\s+/g,'') === q) score += 100;
      (f.kws||[]).forEach(k => {
        if (q.includes(k.toLowerCase())) score += k.length >= 3 ? 3 : 2;
      });
      if (score > bestScore){ bestScore = score; best = f; }
    });
    // FAQ 매칭 점수 임계값 상향 — 단일 키워드만으론 매칭 안 되게
    return bestScore >= 5 ? best : null;
  }

  function needsEscalation(text){
    if (!DATA || !DATA.escalate) return false;
    const t = text.toLowerCase();
    return (DATA.escalate.keywords||[]).some(k => t.includes(k.toLowerCase())) && text.length >= (DATA.escalate.min_length||15);
  }

  // ============================================================
  // BUSINESS HOURS
  // ============================================================
  function isBusinessHour(){
    const d = new Date();
    const day = d.getDay();
    const hour = d.getHours();
    if (day === 0 || day === 6) return false;
    return hour >= 9 && hour < 18;
  }

  // ============================================================
  // CSS
  // ============================================================
  const CSS = `
  .hrbot-fab{position:fixed;right:22px;bottom:22px;z-index:9998;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#00B893 0%,#4C6EF5 100%);color:#fff;border:none;cursor:pointer;box-shadow:0 10px 30px rgba(0,184,147,0.35);display:flex;align-items:center;justify-content:center;font-size:24px;transition:transform 0.2s,box-shadow 0.2s;font-family:inherit}
  .hrbot-fab:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(0,184,147,0.45)}
  .hrbot-fab .hrbot-pulse{position:absolute;inset:-2px;border-radius:50%;border:2px solid #00B893;opacity:0.6;animation:hrbot-pulse 2s infinite;pointer-events:none}
  @keyframes hrbot-pulse{0%{transform:scale(1);opacity:0.6}100%{transform:scale(1.3);opacity:0}}
  .hrbot-badge{position:absolute;top:-4px;right:-4px;background:#FF3B30;color:#fff;border-radius:50%;width:20px;height:20px;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
  .hrbot-win{position:fixed;right:22px;bottom:94px;z-index:9999;width:400px;max-width:calc(100vw - 30px);height:620px;max-height:calc(100vh - 120px);background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,0.25);display:none;flex-direction:column;overflow:hidden;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;animation:hrbot-pop 0.2s}
  .hrbot-win.open{display:flex}
  @keyframes hrbot-pop{from{opacity:0;transform:translateY(10px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
  .hrbot-head{background:linear-gradient(135deg,#191919 0%,#2a2a2a 100%);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .hrbot-head h4{margin:0;font-size:15px;font-weight:800;letter-spacing:-0.3px;display:flex;align-items:center;gap:8px}
  .hrbot-head .dot{width:8px;height:8px;border-radius:50%;background:#00B893;animation:hrbot-dot 1.8s infinite}
  @keyframes hrbot-dot{0%,100%{box-shadow:0 0 0 0 rgba(0,184,147,0)}70%{box-shadow:0 0 0 8px rgba(0,184,147,0.4)}}
  .hrbot-head .meta{font-size:11px;color:rgba(255,255,255,0.6);margin-top:3px;font-weight:500;display:flex;gap:6px;align-items:center}
  .hrbot-head .meta .bh{background:rgba(0,184,147,0.2);color:#00B893;padding:1px 7px;border-radius:10px;font-weight:700}
  .hrbot-head .meta .bh.off{background:rgba(255,146,43,0.2);color:#FF922B}
  .hrbot-head-btns{display:flex;gap:4px}
  .hrbot-head-btns button{background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:14px;padding:6px 8px;border-radius:6px;line-height:1;transition:background 0.15s;font-family:inherit}
  .hrbot-head-btns button:hover{background:rgba(255,255,255,0.1);color:#fff}
  .hrbot-head-btns .close-btn{font-size:20px}
  .hrbot-body{flex:1;overflow-y:auto;padding:18px;background:#FAFAFA;scroll-behavior:smooth}
  .hrbot-body::-webkit-scrollbar{width:6px}
  .hrbot-body::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:3px}
  .hrbot-msg{display:flex;margin-bottom:12px;animation:hrbot-fade 0.25s;flex-direction:column}
  @keyframes hrbot-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .hrbot-msg.bot{align-items:flex-start}
  .hrbot-msg.user{align-items:flex-end}
  .hrbot-msg.bot .hrbot-bubble{background:#fff;color:#191919;border:1px solid #E5E7EB;border-radius:4px 14px 14px 14px;max-width:85%}
  .hrbot-msg.user .hrbot-bubble{background:linear-gradient(135deg,#00B893,#4C6EF5);color:#fff;border-radius:14px 14px 4px 14px;max-width:80%}
  .hrbot-bubble{padding:11px 14px;font-size:13.5px;line-height:1.7;font-weight:500;word-break:break-word}
  .hrbot-bubble em{color:#00B893;font-style:normal;font-weight:700}
  .hrbot-msg.user .hrbot-bubble em{color:#fff;text-decoration:underline}
  .hrbot-bubble a{color:#4C6EF5;text-decoration:underline;font-weight:700}
  .hrbot-msg.user .hrbot-bubble a{color:#fff}
  .hrbot-feedback{margin-top:4px;margin-left:6px;display:flex;gap:4px;opacity:0.7}
  .hrbot-feedback button{background:#fff;border:1px solid #E5E7EB;color:#6B7280;font-size:11px;padding:3px 9px;border-radius:12px;cursor:pointer;font-family:inherit;transition:all 0.15s}
  .hrbot-feedback button:hover{border-color:#00B893;color:#00B893}
  .hrbot-feedback button.active{background:#F0FDF4;border-color:#00B893;color:#00B893}
  .hrbot-feedback .down.active{background:#FEE2E2;border-color:#DC2626;color:#DC2626}
  .hrbot-chips{display:flex;flex-direction:column;gap:6px;margin:6px 0 12px;align-items:flex-start;width:100%}
  .hrbot-chip{background:#fff;border:1px solid #D1D5DB;color:#374151;font-size:12.5px;padding:8px 12px;border-radius:16px;cursor:pointer;transition:all 0.15s;font-family:inherit;font-weight:500;text-align:left;line-height:1.4;max-width:100%}
  .hrbot-chip:hover{border-color:#00B893;color:#00B893;background:#F0FDF4}
  .hrbot-cats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0 12px}
  .hrbot-cat{background:#fff;border:1px solid #E5E7EB;padding:10px 12px;border-radius:10px;cursor:pointer;font-size:12.5px;font-weight:600;font-family:inherit;color:#374151;display:flex;align-items:center;gap:6px;transition:all 0.15s}
  .hrbot-cat:hover{border-color:#00B893;background:#F0FDF4;color:#00B893}
  .hrbot-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}
  .hrbot-action{background:#00B893;color:#fff;font-size:12.5px;padding:9px 14px;border-radius:10px;text-decoration:none;font-weight:700;transition:opacity 0.15s;display:inline-block;border:none;cursor:pointer;font-family:inherit}
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
  .hrbot-wiz-card{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px;margin-bottom:12px}
  .hrbot-wiz-card h5{margin:0 0 10px;font-size:13.5px;font-weight:800;color:#191919}
  .hrbot-wiz-opt{display:block;width:100%;text-align:left;background:#FAFAFA;border:1px solid #E5E7EB;padding:10px 14px;margin:6px 0;border-radius:9px;font-size:13px;color:#374151;cursor:pointer;font-family:inherit;font-weight:500;transition:all 0.15s;line-height:1.5}
  .hrbot-wiz-opt:hover{border-color:#00B893;background:#F0FDF4;color:#00B893}
  .hrbot-wiz-result{background:linear-gradient(135deg,#F0FDF4 0%,#EEF2FF 100%);border:1.5px solid #00B893;border-radius:12px;padding:16px;margin-bottom:12px}
  .hrbot-wiz-result h5{font-size:14.5px;font-weight:900;margin:0 0 8px;color:#191919}
  .hrbot-wiz-result p{font-size:13px;line-height:1.7;color:#333;margin:0 0 12px;font-weight:500}
  .hrbot-form{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px;margin-bottom:12px}
  .hrbot-form h5{margin:0 0 6px;font-size:13.5px;font-weight:800}
  .hrbot-form p{font-size:12px;color:#6B7280;margin:0 0 12px;line-height:1.6}
  .hrbot-form label{display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:4px}
  .hrbot-form input,.hrbot-form textarea{width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit;outline:none;margin-bottom:10px;box-sizing:border-box;font-weight:500}
  .hrbot-form input:focus,.hrbot-form textarea:focus{border-color:#00B893}
  .hrbot-form textarea{resize:vertical;min-height:70px;line-height:1.6}
  .hrbot-form button{width:100%;padding:10px;background:#00B893;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  .hrbot-form button:hover{opacity:0.9}
  @media(max-width:480px){
    .hrbot-win{right:10px;left:10px;bottom:82px;width:auto;height:78vh}
    .hrbot-fab{right:14px;bottom:14px;width:54px;height:54px;font-size:22px}
  }
  `;

  // ============================================================
  // DOM HELPERS
  // ============================================================
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
  function scrollBottom(){ body.scrollTop = body.scrollHeight; }
  function rec(role, text, meta){
    const hist = loadHistory() || [];
    hist.push({role, text, meta, at: Date.now()});
    saveHistory(hist);
  }

  // ============================================================
  // RENDER HELPERS
  // ============================================================
  function addBotMsg(html, opts){
    opts = opts || {};
    const bubble = h('div',{'class':'hrbot-bubble','html':html});
    const msg = h('div',{'class':'hrbot-msg bot'}, bubble);
    // 피드백 버튼 (FAQ 답변만)
    if (opts.feedback){
      const fb = h('div',{'class':'hrbot-feedback'});
      const up = h('button',{'class':'up','onClick':()=>{
        up.classList.add('active'); up.disabled = true; down.disabled = true;
        recordStat('feedback', {q: opts.query, a: opts.faqId, up: true});
      }},'👍 도움됐어요');
      const down = h('button',{'class':'down','onClick':()=>{
        down.classList.add('active'); up.disabled = true; down.disabled = true;
        recordStat('feedback', {q: opts.query, a: opts.faqId, up: false});
        // 👎 시 사람 상담 폼 유도
        setTimeout(()=>{
          addBotMsg('답변이 부족했다면 <em>담당 노무사에게 직접 문의</em>를 받아보시겠어요?');
          addActions([
            {label:'📧 사람과 상담하기', action:'open-human-form'},
            {label:'💬 자문 의뢰', href:'/order', ghost:true}
          ]);
        }, 300);
      }},'👎 부족해요');
      fb.appendChild(up); fb.appendChild(down);
      msg.appendChild(fb);
    }
    body.appendChild(msg); scrollBottom();
    if (!opts.norecord) rec('bot', html, opts.meta);
  }
  function addUserMsg(text){
    const m = h('div',{'class':'hrbot-msg user'}, h('div',{'class':'hrbot-bubble'}, text));
    body.appendChild(m); scrollBottom();
    rec('user', text);
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
        respond(s);
      }}, s);
      wrap.appendChild(c);
    });
    body.appendChild(wrap); scrollBottom();
  }
  function addActions(actions){
    if (!actions || !actions.length) return;
    const wrap = h('div',{'class':'hrbot-actions'});
    actions.forEach(a => {
      let el;
      if (a.action === 'open-human-form'){
        el = h('button',{'class':'hrbot-action'+(a.ghost?' ghost':''),'onClick':()=>{wrap.remove();showHumanForm();}}, a.label);
      } else if (a.action === 'start-wizard'){
        el = h('button',{'class':'hrbot-action'+(a.ghost?' ghost':''),'onClick':()=>{wrap.remove();startWizard();}}, a.label);
      } else if (a.action === 'handoff'){
        el = h('button',{'class':'hrbot-action'+(a.ghost?' ghost':''),'onClick':()=>{wrap.remove();summarizeAndHandoff();}}, a.label);
      } else if (a.href){
        el = h('a',{'class':'hrbot-action'+(a.ghost?' ghost':''),'href':a.href}, a.label);
      }
      if (el) wrap.appendChild(el);
    });
    body.appendChild(wrap); scrollBottom();
  }

  // ============================================================
  // CATEGORIES
  // ============================================================
  function showCategories(){
    if (!DATA || !DATA.categories) return;
    const intro = h('div',{'class':'hrbot-msg bot'}, h('div',{'class':'hrbot-bubble','html':'어떤 주제가 궁금하신가요? 카테고리를 골라 보세요.'}));
    body.appendChild(intro);
    const grid = h('div',{'class':'hrbot-cats'});
    DATA.categories.forEach(c => {
      const count = DATA.faq.filter(f => f.category === c.id).length;
      if (!count) return;
      const btn = h('button',{'class':'hrbot-cat','type':'button','onClick':()=>{
        grid.remove();
        showCategoryFAQs(c);
      }}, `${c.icon} ${c.label} (${count})`);
      grid.appendChild(btn);
    });
    body.appendChild(grid); scrollBottom();
  }
  function showCategoryFAQs(cat){
    const items = DATA.faq.filter(f => f.category === cat.id);
    const intro = h('div',{'class':'hrbot-msg bot'}, h('div',{'class':'hrbot-bubble','html':`<em>${cat.icon} ${cat.label}</em> 관련 질문:`}));
    body.appendChild(intro);
    const wrap = h('div',{'class':'hrbot-chips'});
    items.forEach(f => {
      const c = h('button',{'class':'hrbot-chip','type':'button','onClick':()=>{
        wrap.remove();
        addUserMsg(f.q);
        respond(f.q);
      }}, f.q);
      wrap.appendChild(c);
    });
    body.appendChild(wrap); scrollBottom();
  }

  // ============================================================
  // WIZARD (서비스 추천)
  // ============================================================
  let wizardStep = null;
  function startWizard(){
    if (!DATA || !DATA.wizard) return;
    addBotMsg(`<em>${DATA.wizard.title}</em><br>${DATA.wizard.intro}`, {norecord:true});
    showWizardStep(DATA.wizard.start);
  }
  function showWizardStep(stepId){
    const step = DATA.wizard.steps[stepId];
    if (!step) return;
    if (step.result){
      const card = h('div',{'class':'hrbot-wiz-result'}, [
        h('h5',null,step.title),
        h('p',{'html':step.text}),
        renderActions(step.actions)
      ]);
      body.appendChild(card); scrollBottom();
      setTimeout(()=>addBotMsg('다른 것도 궁금하시면 편하게 물어보세요!', {norecord:true}), 500);
      return;
    }
    const card = h('div',{'class':'hrbot-wiz-card'});
    card.appendChild(h('h5',null,step.question));
    step.options.forEach(o => {
      card.appendChild(h('button',{'class':'hrbot-wiz-opt','type':'button','onClick':()=>{
        addUserMsg(o.label);
        showWizardStep(o.next);
      }}, o.label));
    });
    body.appendChild(card); scrollBottom();
  }
  function renderActions(actions){
    const w = h('div',{'class':'hrbot-actions'});
    actions.forEach(a => {
      if (a.href) w.appendChild(h('a',{'class':'hrbot-action'+(a.ghost?' ghost':''),'href':a.href}, a.label));
    });
    return w;
  }

  // ============================================================
  // HUMAN FORM
  // ============================================================
  function showHumanForm(){
    if (!DATA || !DATA.human_form) return;
    const hf = DATA.human_form;
    const form = h('form',{'class':'hrbot-form'});
    form.appendChild(h('h5',null,hf.title));
    form.appendChild(h('p',null,hf.intro));
    hf.fields.forEach(f => {
      form.appendChild(h('label',null,f.label + (f.required?' *':'')));
      if (f.type === 'textarea'){
        form.appendChild(h('textarea',{'name':f.id,'required':f.required?'required':null}));
      } else {
        form.appendChild(h('input',{'type':'text','name':f.id,'required':f.required?'required':null}));
      }
    });
    form.appendChild(h('button',{'type':'submit'}, hf.submit_label));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = {};
      hf.fields.forEach(f => {
        const el = form.querySelector(`[name="${f.id}"]`);
        data[f.id] = el.value.trim();
      });
      if (hf.fields.some(f => f.required && !data[f.id])){
        alert('필수 항목을 입력해 주세요.'); return;
      }
      // mailto 링크로 이메일 작성 창 오픈 (백엔드 없을 때 MVP 방식)
      const subject = encodeURIComponent('[HRer 상담봇 문의] ' + (data.name || ''));
      const body_ = encodeURIComponent(
        `성함: ${data.name}\n연락처: ${data.contact}\n\n문의 내용:\n${data.question}\n\n---\n(HRer CS 상담봇에서 접수)`
      );
      window.location.href = `mailto:${hf.email_to}?subject=${subject}&body=${body_}`;
      form.remove();
      addBotMsg(hf.success, {norecord:true});
      recordStat('query', {type:'human_form', ...data});
    });
    body.appendChild(form); scrollBottom();
  }

  // ============================================================
  // HANDOFF — 대화 내용을 의뢰폼으로 넘기기
  // ============================================================
  const HANDOFF_KEY = 'hrer_bot_handoff';
  const SUMMARIZE_ENDPOINT = '/api/summarize';
  const ORDER_ROUTES = {
    'consult': '/order',
    'unfair-dismissal': '/order_unfair-dismissal',
    'investigation': '/order_investigation',
    'hr-evaluation': '/order_hr_evaluation',
    'employment-rules': '/order_employment_rules',
  };
  async function summarizeAndHandoff(){
    const hist = loadHistory() || [];
    const userCount = hist.filter(m => m.role==='user').length;
    if (userCount < 1){
      addBotMsg('아직 대화 내용이 충분하지 않아요. 몇 가지 질문을 더 나눠주시거나, <a href="/order">바로 의뢰 폼</a>으로 가셔도 됩니다.', {norecord:true});
      return;
    }
    addTyping();
    recordStat('query', {type:'handoff'});
    try {
      const r = await fetch(SUMMARIZE_ENDPOINT, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({history: hist}),
      });
      const data = await r.json();
      removeTyping();
      // localStorage에 핸드오프 데이터 저장 (30분 유효)
      const payload = {
        at: Date.now(),
        summary: data.summary || '',
        bullets: data.bullets || [],
        title: data.title || '상담봇 대화 문의',
        recommended: data.recommended || 'consult',
        tier: data.tier || null,
        transcript: hist.slice(-40).map(m => ({
          role: m.role,
          text: (m.text||'').replace(/<[^>]+>/g,'').slice(0,600),
          at: m.at,
        })),
      };
      try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(payload)); } catch(e){}
      // 요약 확인 카드 표시
      const card = h('div',{'class':'hrbot-wiz-result'}, [
        h('h5',null,'📋 의뢰폼으로 보낼 요약'),
        h('p',{'html': '<strong>제목:</strong> '+escapeHTML(payload.title)+'<br><br><strong>요지:</strong><br>'+escapeHTML(payload.summary)+'<br><br>'+(payload.bullets.length?'<strong>핵심 포인트:</strong><br>• '+payload.bullets.map(escapeHTML).join('<br>• '):'')}),
        h('p',{'style':{fontSize:'12px',color:'#6B7280',marginBottom:'14px'}},'의뢰 페이지에서 확인·수정 후 제출하실 수 있어요. 전체 대화 기록도 자동 첨부됩니다.'),
        (function(){
          const w = h('div',{'class':'hrbot-actions'});
          const route = ORDER_ROUTES[payload.recommended] || '/order';
          const url = route + '?from=chatbot';
          w.appendChild(h('a',{'class':'hrbot-action','href':url},'✅ 의뢰 페이지로 이동'));
          w.appendChild(h('button',{'class':'hrbot-action ghost','type':'button','onClick':()=>{card.remove(); addBotMsg('더 이야기 나눠주세요!', {norecord:true});}},'↩ 대화 계속하기'));
          return w;
        })(),
      ]);
      body.appendChild(card); scrollBottom();
    } catch(e){
      removeTyping();
      addBotMsg('요약에 실패했어요. <a href="/order">의뢰 폼으로 직접 이동</a>하셔도 돼요.', {norecord:true});
    }
  }
  function escapeHTML(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ============================================================
  // AI STREAM (Gemini) — Server-Sent Events로 토큰 단위 수신
  // ============================================================
  const AI_ENDPOINT = '/api/chat';
  function createStreamingBubble(){
    const bubble = h('div',{'class':'hrbot-bubble','html':''});
    const msg = h('div',{'class':'hrbot-msg bot'}, bubble);
    body.appendChild(msg); scrollBottom();
    return {msg, bubble};
  }
  async function streamAI(text, onChunk){
    const hist = (loadHistory() || []).slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: (m.text||'').replace(/<[^>]+>/g,'').slice(0, 400),
    }));
    const r = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json','Accept':'text/event-stream'},
      body: JSON.stringify({message: text, history: hist, stream: true}),
    });
    if (!r.ok) throw new Error('ai_http_' + r.status);
    const ctype = r.headers.get('content-type') || '';
    // 스트리밍 미지원 시 JSON으로 폴백
    if (!ctype.includes('text/event-stream')){
      const data = await r.json();
      if (data.reply) onChunk(data.reply, true);
      return {mode: data.mode || 'json'};
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', mode = 'ai';
    while(true){
      const {done, value} = await reader.read();
      if (done) break;
      buf += decoder.decode(value, {stream:true});
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const p of parts){
        const lines = p.split('\n');
        for (const line of lines){
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          if (raw === '[DONE]') continue;
          try {
            const j = JSON.parse(raw);
            if (j.chunk) onChunk(j.chunk, false);
            if (j.replace) onChunk({replace: j.replace}, false);
            if (j.mode) mode = j.mode;
            if (j.done) onChunk('', true);
          } catch(e){ /* skip */ }
        }
      }
    }
    return {mode};
  }

  // ============================================================
  // RESPOND — 인위 지연 제거, 스트리밍 우선
  // ============================================================
  async function respond(text){
    recordStat('query', {q: text});
    if (!DATA){
      addBotMsg('잠시만요, 데이터 로딩 중이에요. 다시 시도해 주세요.');
      return;
    }
    // 1) 법률 판단 의도 — 즉시 에스컬레이션
    if (needsEscalation(text)){
      consecutiveMisses = 0;
      addBotMsg(DATA.escalate.message);
      addActions(DATA.escalate.actions);
      return;
    }
    // 2) FAQ 매칭 — 즉시 답변 (인위 지연 삭제)
    const m = matchFAQ(text);
    if (m){
      consecutiveMisses = 0;
      addBotMsg(m.a, {feedback:true, query:text, faqId:m.q});
      if (m.cta) addActions(m.cta);
      return;
    }
    // 3) FAQ 미매칭 → AI 스트리밍
    addTyping();
    let streamMsg = null, streamBubble = null, accumulated = '';
    try {
      const result = await streamAI(text, (chunk, done) => {
        if (!streamMsg){
          removeTyping();
          const s = createStreamingBubble();
          streamMsg = s.msg; streamBubble = s.bubble;
        }
        if (chunk && typeof chunk === 'object' && chunk.replace){
          // 위험 패턴 감지 시 전체 텍스트 교체
          accumulated = chunk.replace;
          streamBubble.innerHTML = accumulated;
          scrollBottom();
        } else if (typeof chunk === 'string' && chunk){
          accumulated += chunk;
          streamBubble.innerHTML = accumulated;
          scrollBottom();
        }
        if (done && streamBubble){
          // 피드백 버튼 부착
          const fb = h('div',{'class':'hrbot-feedback'});
          const up = h('button',{'class':'up','onClick':()=>{
            up.classList.add('active'); up.disabled = true; down.disabled = true;
            recordStat('feedback', {q:text, a:'[AI]', up:true});
          }},'👍 도움됐어요');
          const down = h('button',{'class':'down','onClick':()=>{
            down.classList.add('active'); up.disabled = true; down.disabled = true;
            recordStat('feedback', {q:text, a:'[AI]', up:false});
          }},'👎 부족해요');
          fb.appendChild(up); fb.appendChild(down);
          streamMsg.appendChild(fb); scrollBottom();
          rec('bot', accumulated);
        }
      });
      if (result && result.mode === 'ai'){
        consecutiveMisses = 0;
        return;
      }
      // 스트리밍 성공했지만 ai 모드가 아닌 경우 (no_api_key 등) → fallback 처리 이어감
      if (accumulated) return;
    } catch(e){
      console.error('stream_error', e);
    }
    // 4) AI 실패 → fallback
    removeTyping();
    if (streamMsg) streamMsg.remove();
    consecutiveMisses++;
    recordStat('miss', {q: text});
    addBotMsg(DATA.fallback.text);
    if (DATA.fallback.use_quick_suggestions) addSuggestions(DATA.quick_suggestions);
    const acts = DATA.fallback.actions.slice();
    if (consecutiveMisses >= 2 && !acts.some(a=>a.action==='open-human-form')){
      acts.unshift({label:'📧 사람과 상담하기', action:'open-human-form'});
    }
    addActions(acts);
  }

  // ============================================================
  // RESTORE
  // ============================================================
  function restoreHistory(){
    const hist = loadHistory();
    if (!hist || !hist.length) return false;
    hist.forEach(m => {
      if (m.role === 'user'){
        body.appendChild(h('div',{'class':'hrbot-msg user'}, h('div',{'class':'hrbot-bubble'}, m.text)));
      } else {
        body.appendChild(h('div',{'class':'hrbot-msg bot'}, h('div',{'class':'hrbot-bubble','html':m.text})));
      }
    });
    scrollBottom();
    // 구분 메시지
    const div = h('div',{'class':'hrbot-msg bot'}, h('div',{'class':'hrbot-bubble','style':{background:'#FEF3C7',borderColor:'#FCD34D',color:'#92400E'},'html':'↑ 이전 대화 복원됨. 이어서 질문하시거나 새로 시작하실 수 있어요.'}));
    body.appendChild(div);
    scrollBottom();
    return true;
  }

  // ============================================================
  // INIT
  // ============================================================
  function init(){
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    fab = h('button',{'class':'hrbot-fab','aria-label':'상담봇 열기','onClick':toggle},
      [h('span',{'class':'hrbot-pulse'}),'💬',h('span',{'class':'hrbot-badge'},'1')]);
    document.body.appendChild(fab);

    body = h('div',{'class':'hrbot-body'});
    const bh = isBusinessHour();
    win = h('div',{'class':'hrbot-win','role':'dialog','aria-label':'HRer 상담봇'}, [
      h('div',{'class':'hrbot-head'}, [
        h('div',null, [
          h('h4',null,[h('span',{'class':'dot'}),'HRer 상담봇']),
          h('div',{'class':'meta'},[
            h('span',{'class':'bh'+(bh?'':' off')}, bh?'🟢 영업 중':'🟡 영업 외'),
            '영업일 24시간 이내 답변'
          ])
        ]),
        h('div',{'class':'hrbot-head-btns'},[
          h('button',{'aria-label':'카테고리 보기','title':'카테고리 보기','onClick':showCategories},'📋'),
          h('button',{'aria-label':'서비스 추천 마법사','title':'서비스 추천 마법사','onClick':startWizard},'🧭'),
          h('button',{'aria-label':'이 대화로 의뢰하기','title':'이 대화로 의뢰하기','onClick':summarizeAndHandoff},'🎯'),
          h('button',{'aria-label':'대화 초기화','title':'대화 초기화','onClick':resetChat},'🔄'),
          h('button',{'aria-label':'닫기','class':'close-btn','onClick':close},'×')
        ])
      ]),
      body,
      h('form',{'class':'hrbot-input'},[
        h('input',{'type':'text','placeholder':'궁금한 점을 편하게 물어보세요','id':'hrbot-input','autocomplete':'off'}),
        h('button',{'type':'submit'},'전송')
      ]),
      h('div',{'class':'hrbot-footer','html':'* 일반 정보 안내용. 구체 법률 판단은 <a href="/order" style="color:#4C6EF5;font-weight:700">자문 의뢰</a>를 이용해 주세요.'})
    ]);
    document.body.appendChild(win);

    const form = win.querySelector('form');
    input = win.querySelector('#hrbot-input');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      addUserMsg(v);
      input.value = '';
      respond(v);
    });

    fetch(DATA_URL).then(r=>r.json()).then(d => {
      DATA = d;
      // 히스토리 복원 시도
      if (!restoreHistory()){
        setTimeout(()=>{
          addBotMsg(d.greeting.text, {norecord:true});
          if (d.greeting.show_wizard_hint){
            const hintMsg = h('div',{'class':'hrbot-msg bot'});
            const bubble = h('div',{'class':'hrbot-bubble','style':{background:'#F0FDF4',borderColor:'#00B893'},'html':d.greeting.wizard_hint});
            bubble.querySelector('[data-action="start-wizard"]').addEventListener('click', e => {
              e.preventDefault();
              startWizard();
            });
            hintMsg.appendChild(bubble);
            body.appendChild(hintMsg); scrollBottom();
          }
          if (d.greeting.use_quick_suggestions) addSuggestions(d.quick_suggestions);
        }, 200);
      }
    }).catch(err => {
      console.error('HRer bot data load failed', err);
      setTimeout(()=>addBotMsg('죄송해요, 데이터 로딩에 실패했어요. <a href="/order">자문 의뢰</a>로 직접 문의해 주세요.'), 300);
    });

    window.__hrbot_state = {open:false};

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && window.__hrbot_state.open) close();
    });

    // 관리자 전역 API 노출 (대시보드에서 활용)
    window.hrerBotStats = function(){
      try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch(e){ return {}; }
    };
    window.hrerBotClearStats = function(){
      try { localStorage.removeItem(STATS_KEY); return true; } catch(e){ return false; }
    };
  }

  function toggle(){
    const s = window.__hrbot_state;
    s.open = !s.open;
    win.classList.toggle('open', s.open);
    if (s.open){
      const b = fab.querySelector('.hrbot-badge'); if (b) b.remove();
      setTimeout(()=>input.focus(), 250);
    }
  }
  function close(){ window.__hrbot_state.open = false; win.classList.remove('open'); }
  function resetChat(){
    if (!confirm('대화를 모두 지우고 새로 시작할까요?')) return;
    clearHistory();
    body.innerHTML = '';
    consecutiveMisses = 0;
    if (DATA){
      addBotMsg(DATA.greeting.text, {norecord:true});
      if (DATA.greeting.use_quick_suggestions) addSuggestions(DATA.quick_suggestions);
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
