// All prompts live here so behaviour is easy to tune.
const clip = (s, n) => String(s ?? "").slice(0, n);
const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

exports.questions = ({ role, company, skills, difficulty, count, resumeText }) => ({
  system: "You are a senior technical interviewer. Reply with JSON only.",
  parts: [{ text:
`Create ${num(count, 3, 10)} spoken interview questions for a candidate applying as "${clip(role, 80)}"${company ? ` at ${clip(company, 60)}` : ""}.
Difficulty: ${clip(difficulty, 20) || "medium"}. Candidate skills: ${clip([].concat(skills || []).join(", "), 300) || "not given"}.
Resume excerpt: ${clip(resumeText, 1500) || "none"}.
Rules: start with a short intro question; mix technical, behavioural and one resume/company-specific question; each must be answerable aloud in 1-2 minutes; no code-writing tasks.
Return {"questions":[{"q":"...","type":"intro|technical|behavioural","focus":"skill or topic"}]}` }],
});

exports.evaluate = ({ role, question, answer, durationSec }) => ({
  system: "You are a strict but fair interview coach scoring a spoken answer transcribed by speech-to-text (ignore minor transcription errors and punctuation). Reply with JSON only.",
  parts: [{ text:
`Role: ${clip(role, 80)}
Question: ${clip(question, 400)}
Answer transcript (${num(durationSec, 0, 600)}s): """${clip(answer, 4000)}"""
Score 0-100 for: content (technical correctness and depth), relevance (answers what was asked), structure (clear, organised, uses examples/STAR), confidence (decisive language, not hesitant).
Return {"content":n,"relevance":n,"structure":n,"confidence":n,"score":n,"strengths":["..."],"improvements":["..."],"model_answer_hint":"one or two sentences on what a strong answer includes"}
Give 1-3 concrete strengths and improvements each. A blank or off-topic answer must score under 25.` }],
});

exports.summary = ({ role, items }) => ({
  system: "You are a career coach. Reply with JSON only.",
  parts: [{ text:
`Role: ${clip(role, 80)}. Per-question results: ${clip(JSON.stringify(items), 6000)}
Return {"headline":"one sentence verdict","strengths":["..."],"focus_areas":["..."],"next_steps":["3 actionable steps for the next week"]}` }],
});

exports.career = ({ role, skills, missing, resumeText }) => ({
  system: "You are a career mentor for students. Reply with JSON only.",
  parts: [{ text:
`Target role: ${clip(role, 80)}. Skills found: ${clip([].concat(skills || []).join(", "), 400)}. Missing skills: ${clip([].concat(missing || []).join(", "), 400)}.
Resume: ${clip(resumeText, 3000) || "none"}
Return {"summary":"2-3 sentences","strengths":["..."],"resume_tips":["3 specific tips"],"roadmap":[{"week":"Week 1-2","goal":"...","tasks":["..."]}]} with a 6-8 week roadmap that closes the missing skills in priority order.` }],
});

exports.resumeText = () => ({
  system: "You extract plain text from documents. Output the full text of the resume only, preserving section headings. No commentary.",
  parts: [{ text: "Extract all text from this resume." }],
});
