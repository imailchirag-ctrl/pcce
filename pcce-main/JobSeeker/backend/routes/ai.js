const router = require("express").Router();
const { generate } = require("../services/gemini");
const P = require("../services/prompts");

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req.body || {})); }
  catch (e) { console.error("[ai]", e.message); res.status(e.status || 500).json({ error: e.message }); }
};
const need = (cond, msg) => { if (!cond) throw Object.assign(new Error(msg), { status: 400 }); };

router.post("/interview/questions", wrap(async (b) => {
  need(b.role, "role is required");
  const out = await generate({ ...P.questions(b), temperature: 0.8 });
  const qs = (out.questions || []).filter((q) => q && q.q).slice(0, 10);
  need(qs.length, "No questions generated");
  return { questions: qs };
}));

router.post("/interview/evaluate", wrap(async (b) => {
  need(b.question, "question is required");
  need(typeof b.answer === "string", "answer is required");
  return generate({ ...P.evaluate(b), temperature: 0.2 });
}));

router.post("/interview/summary", wrap(async (b) => {
  need(Array.isArray(b.items) && b.items.length, "items are required");
  return generate({ ...P.summary(b), temperature: 0.4 });
}));

router.post("/career/insights", wrap(async (b) => {
  need(b.role, "role is required");
  return generate({ ...P.career(b), temperature: 0.5 });
}));

// PDF / DOCX / image resume -> text, using Gemini's native document understanding.
router.post("/resume/extract", wrap(async (b) => {
  need(b.data && b.mime, "data and mime are required");
  need(b.data.length < 9_000_000, "File too large (max ~6 MB)");
  const p = P.resumeText();
  const text = await generate({ system: p.system, parts: [...p.parts, { inlineData: { mimeType: b.mime, data: b.data } }], json: false, temperature: 0 });
  return { text };
}));

module.exports = router;
