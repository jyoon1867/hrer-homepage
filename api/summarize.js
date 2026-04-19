/*!
 * HRer Chat Summarize API — Gemini 기반 대화 요약 + 서비스 추천
 *
 * 입력: {history: [{role, text}, ...]}
 * 출력: {
 *   summary: "요지 3~5줄",
 *   bullets: ["핵심 포인트 1", "핵심 포인트 2", ...],
 *   recommended: "consult"|"unfair-dismissal"|"investigation"|"hr-evaluation"|"employment-rules",
 *   tier: "simple"|"deep"|"written"|null   // 자문일 때만
 * }
 *
 * 환경변수: GEMINI_API_KEY
 */

const SUMMARY_PROMPT = `당신은 HRer 서비스 의뢰폼에 자동으로 채워 넣을 정보를 생성하는 도우미입니다.

고객이 챗봇과 나눈 대화 기록이 주어지면, 다음 JSON 형식으로 응답하세요. 다른 말은 하지 마세요.

{
  "summary": "의뢰 목적을 2~3문장으로 요약. 고객이 직접 쓴 것처럼 1인칭 예사말로.",
  "bullets": ["핵심 상황 1", "핵심 상황 2", "핵심 상황 3"],
  "recommended": "consult" | "unfair-dismissal" | "investigation" | "hr-evaluation" | "employment-rules",
  "tier": "simple" | "deep" | "written" | null,
  "title": "20자 내외 제목"
}

# 추천 기준
- consult(노무자문): 법·규정 해석 질문, 절차 문의
- unfair-dismissal: 해고·징계·인사명령·구제신청
- investigation: 괴롭힘·성희롱 조사
- hr-evaluation: 평가 제도·보상 설계
- employment-rules: 취업규칙 제정·개정

# tier 기준 (consult일 때만)
- simple: 단일 쟁점, 빠른 확인
- deep: 복수 쟁점, 판단 필요
- written: 공식 의견서, 대외 제출

# 작성 규칙
- summary: "~에 대해 문의드립니다", "~상황에서 조언이 필요합니다" 같은 정중한 1인칭
- bullets: 명사구 위주 간결하게 (각 30자 내외)
- 불확실하면 recommended: "consult", tier: "simple"
- 법률 판단 절대 금지. 사실관계 정리만.

# 출력 예시
{
  "summary": "직원 한 명이 카카오톡으로 다른 직원에게 반복적으로 욕설을 한 건이 접수되어, 직장 내 괴롭힘 해당 여부와 외부 조사 의뢰 필요성을 확인하고 싶습니다.",
  "bullets": ["카카오톡을 통한 욕설 발생", "신고 접수 후 사내 처리 검토 중", "외부 조사자 의뢰 필요성 문의"],
  "recommended": "investigation",
  "tier": null,
  "title": "카톡 욕설 괴롭힘 조사 문의"
}
`;

async function callGemini(apiKey, prompt){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const payload = {
    systemInstruction: {parts:[{text: SUMMARY_PROMPT}]},
    contents: [{role:'user', parts:[{text: prompt}]}],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 600,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      {category:'HARM_CATEGORY_HARASSMENT', threshold:'BLOCK_ONLY_HIGH'},
      {category:'HARM_CATEGORY_HATE_SPEECH', threshold:'BLOCK_ONLY_HIGH'},
      {category:'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold:'BLOCK_ONLY_HIGH'},
      {category:'HARM_CATEGORY_DANGEROUS_CONTENT', threshold:'BLOCK_ONLY_HIGH'},
    ],
  };
  const r = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload),
  });
  if (!r.ok){
    const txt = await r.text();
    throw new Error(`Gemini ${r.status}: ${txt.slice(0,200)}`);
  }
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

function fallback(history){
  // AI 실패 시 최소 동작
  const userMsgs = history.filter(m => m.role === 'user').map(m => (m.text||'').replace(/<[^>]+>/g,'')).filter(Boolean);
  const last = userMsgs[userMsgs.length-1] || '';
  return {
    summary: last.length > 10 ? `다음 사안에 대해 자문 부탁드립니다: ${last.slice(0, 200)}` : 'HRer 상담봇을 통해 문의드립니다. 자세한 내용은 아래 대화 기록을 참고해 주세요.',
    bullets: userMsgs.slice(-3).map(x => x.slice(0,50)),
    recommended: 'consult',
    tier: 'simple',
    title: '상담봇 대화 문의',
  };
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});

  try {
    const {history = []} = req.body || {};
    if (!Array.isArray(history) || history.length === 0){
      return res.status(400).json({error: 'empty_history'});
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey){
      return res.status(200).json({...fallback(history), mode:'no_api_key'});
    }

    // 대화를 읽기 좋은 형태로 포맷 (HTML 태그 제거)
    const transcript = history.slice(-20).map(m => {
      const clean = (m.text||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
      return `${m.role === 'user' ? '고객' : '봇'}: ${clean}`;
    }).join('\n');

    const prompt = `다음은 고객이 HRer 챗봇과 나눈 대화입니다. 이를 바탕으로 JSON을 생성하세요.\n\n---\n${transcript}\n---`;

    let raw;
    try {
      raw = await callGemini(apiKey, prompt);
    } catch(e){
      console.error('summarize_gemini_error', e.message);
      return res.status(200).json({...fallback(history), mode:'gemini_error'});
    }

    // JSON 파싱
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch(e){
      // JSON이 아닐 경우 대괄호 안쪽만 추출 시도
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch(e2){}
      }
    }

    if (!parsed || !parsed.summary){
      return res.status(200).json({...fallback(history), mode:'parse_error', raw: raw.slice(0,200)});
    }

    // 추천값 검증
    const validRec = ['consult','unfair-dismissal','investigation','hr-evaluation','employment-rules'];
    if (!validRec.includes(parsed.recommended)) parsed.recommended = 'consult';
    const validTier = ['simple','deep','written',null];
    if (parsed.recommended !== 'consult') parsed.tier = null;
    else if (!validTier.includes(parsed.tier)) parsed.tier = 'simple';

    return res.status(200).json({
      summary: String(parsed.summary||'').slice(0, 800),
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0,5).map(String) : [],
      recommended: parsed.recommended,
      tier: parsed.tier,
      title: String(parsed.title||'상담봇 대화 문의').slice(0, 40),
      mode: 'ai',
    });

  } catch (e){
    console.error('summarize_handler_error', e);
    return res.status(500).json({error:'server_error'});
  }
}
