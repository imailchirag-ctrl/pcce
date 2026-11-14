# SkillBridge - AI Skill Gap Detector & Career Readiness Engine

Resume -> skill gaps -> learning plan -> **voice AI mock interview (Gemini)** -> jobs.

## Run
```bash
cd backend
npm install
cp .env.example .env      # paste your key from https://aistudio.google.com/apikey
npm start                 # open http://localhost:5000
```
The server also serves the frontend. Without a key everything still works in an
offline fallback mode (heuristic scoring, built-in question bank).

## AI features (Gemini)
| Feature | Endpoint |
|---|---|
| Role/resume-specific interview questions | `POST /api/interview/questions` |
| Scores each spoken answer (content, relevance, structure, confidence) | `POST /api/interview/evaluate` |
| Final report summary and next steps | `POST /api/interview/summary` |
| Career insights and week-by-week roadmap | `POST /api/career/insights` |
| PDF / image resume -> text | `POST /api/resume/extract` |

Voice uses the browser Web Speech API (Chrome or Edge). Delivery (pace, filler words) is measured locally.

## Structure
`css/style.css` design system - `js/app.js` shell, storage, skill analysis - `js/interview.js` voice interview -
`backend/` Express API (`services/gemini.js`, `services/prompts.js`, `routes/ai.js`).

Data (users, scores) is stored in browser localStorage; jobs are sample listings. Set `WHATSAPP_NUMBER` in `js/app.js` to show the chat button.
