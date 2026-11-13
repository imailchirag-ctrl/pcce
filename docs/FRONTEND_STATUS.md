# Frontend Status — Module 2

## Routes

- Public: `/`, `/login`, `/signup`, `/about`, `/features`.
- Demo authentication: `/auth/role`, `/auth/signup`, `/auth/signup/recruiter`, `/auth/login`, `/auth/forgot`, `/auth/setup`.
- Candidate: `/dashboard`, `/resume`, `/career`, `/learn`, `/interviews`, `/interviews/session`, `/interviews/report`, `/jobs`, `/applications`.
- Candidate aliases under `/dashboard/*` cover resume, career/skills, learning/courses/quizzes, interviews/report, jobs, applications, and profile.
- Recruiter: `/recruiter`, `/recruiter/jobs`, `/recruiter/jobs/new`, `/recruiter/candidates`, `/recruiter/pipeline`, plus applications/analytics/profile aliases.

## Working interactions

- Responsive navigation, links, mobile sidebar, search routing, toast feedback, auth forms, and profile selection.
- Resume file selection/drop validation for PDF/DOCX/TXT, simulated upload progress, illustrative preview, and editable summary. The file stays in the UI and is not uploaded to the API.
- Career target role selection and demo analysis feedback.
- Roadmap completion, course free/paid filters, adding courses/projects to roadmap, weekly goal adjustment, and quiz answer/retry.
- Interview mode selection, sequential question navigation, typed answer submission, demo scoring, and report display.
- Job search/type filters, save/unsave, demo application tracking, and details dialog.
- Recruiter job creation/archive, candidate search/role filters/profile dialog, shortlist toggles, and pipeline stage selection.

All resume/profile/job/course/candidate and interview examples are sample or heuristic demo data. No button sends an external request or claims a real hiring result.
