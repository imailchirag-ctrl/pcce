// Thin Gemini REST client (Node 18+ global fetch, no SDK needed).
const MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function generate({ system, parts, json = true, temperature = 0.5 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("GEMINI_API_KEY is not set on the server."), { status: 503 });
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature, ...(json ? { responseMimeType: "application/json" } : {}) },
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Gemini request failed"), { status: 502 });
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!text) throw Object.assign(new Error("Gemini returned an empty response"), { status: 502 });
  if (!json) return text;
  try { return JSON.parse(text.replace(/^```json|```$/g, "").trim()); }
  catch { throw Object.assign(new Error("Gemini returned invalid JSON"), { status: 502 }); }
}
module.exports = { generate };
