const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Minimal per-IP rate limit so a leaked page cannot burn your Gemini quota.
const hits = new Map();
app.use("/api", (req, res, next) => {
  const now = Date.now(), k = req.ip, h = (hits.get(k) || []).filter((t) => now - t < 60_000);
  if (h.length >= 60) return res.status(429).json({ error: "Too many requests, slow down." });
  h.push(now); hits.set(k, h); next();
});

app.get("/api/health", (_, r) => r.json({ ok: true, ai: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || "gemini-2.5-flash" }));
app.use("/api", require("./routes/ai"));

// Serve the frontend from the project root (never expose the backend folder or dotfiles).
app.use("/backend", (_, r) => r.sendStatus(404));
app.use(express.static(path.join(__dirname, ".."), { dotfiles: "ignore" }));

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`SkillBridge running at http://localhost:${port}  (AI: ${process.env.GEMINI_API_KEY ? "Gemini on" : "no GEMINI_API_KEY - offline fallback"})`));
