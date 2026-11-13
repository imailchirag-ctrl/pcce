export const skills = ["React", "TypeScript", "Node.js", "SQL", "REST APIs", "Git", "Testing"];
export const missingSkills = ["System design", "AWS", "Docker"];
export const partialSkills = ["GraphQL", "CI/CD"];

export type DemoJob = { id: string; title: string; company: string; location: string; salary: string; type: string; match: number; tags: string[]; posted: string };
export const jobs: DemoJob[] = [
  { id: "j1", title: "Frontend Engineer", company: "Northstar Labs", location: "Remote · India", salary: "₹12–18 LPA", type: "Full-time", match: 94, tags: ["React", "TypeScript", "Design systems"], posted: "2 days ago" },
  { id: "j2", title: "Product Engineer", company: "Orbit Health", location: "Bengaluru · Hybrid", salary: "₹14–20 LPA", type: "Full-time", match: 88, tags: ["React", "Node.js", "SQL"], posted: "1 day ago" },
  { id: "j3", title: "UI Developer", company: "Fable Studio", location: "Remote · India", salary: "₹9–14 LPA", type: "Contract", match: 82, tags: ["JavaScript", "CSS", "Accessibility"], posted: "4 days ago" },
  { id: "j4", title: "Full-stack Developer", company: "Pebble Finance", location: "Pune · Hybrid", salary: "₹16–22 LPA", type: "Full-time", match: 79, tags: ["TypeScript", "PostgreSQL", "AWS"], posted: "3 days ago" },
];

export type Course = { id: string; title: string; provider: string; skill: string; duration: string; price: "Free" | "Paid"; level: string; rating: string };
export const courses: Course[] = [
  { id: "c1", title: "System Design for Developers", provider: "Educative", skill: "System design", duration: "6 hours", price: "Paid", level: "Intermediate", rating: "4.8" },
  { id: "c2", title: "AWS Cloud Practitioner Essentials", provider: "AWS Skill Builder", skill: "AWS", duration: "10 hours", price: "Free", level: "Beginner", rating: "4.7" },
  { id: "c3", title: "Docker for the Absolute Beginner", provider: "KodeKloud", skill: "Docker", duration: "4 hours", price: "Free", level: "Beginner", rating: "4.9" },
  { id: "c4", title: "GraphQL with React", provider: "Frontend Masters", skill: "GraphQL", duration: "5 hours", price: "Paid", level: "Intermediate", rating: "4.8" },
];

export const candidates = [
  { id: "p1", name: "Aarav Mehta", role: "Frontend Engineer", location: "Bengaluru", match: 96, experience: "4 years", skills: ["React", "TypeScript", "Accessibility"], status: "New" },
  { id: "p2", name: "Maya Iyer", role: "Product Engineer", location: "Remote", match: 91, experience: "3 years", skills: ["React", "Node.js", "SQL"], status: "Shortlisted" },
  { id: "p3", name: "Rohan Shah", role: "UI Developer", location: "Mumbai", match: 85, experience: "5 years", skills: ["Vue", "Design systems", "CSS"], status: "Reviewing" },
  { id: "p4", name: "Diya Nair", role: "Frontend Engineer", location: "Pune", match: 79, experience: "2 years", skills: ["React", "JavaScript", "Testing"], status: "New" },
];

export const initialRoadmap = [
  { id: "r1", title: "Strengthen system design fundamentals", detail: "Architecture patterns · 3 lessons", done: true },
  { id: "r2", title: "Build and deploy a containerized API", detail: "Docker project · 2–3 hours", done: false },
  { id: "r3", title: "Learn cloud deployment with AWS", detail: "AWS fundamentals · 4 lessons", done: false },
  { id: "r4", title: "Practice a technical interview", detail: "Frontend engineering · 25 minutes", done: false },
];

export const activities = [
  { icon: "resume", text: "Resume analysis completed", time: "Today, 10:42 AM" },
  { icon: "course", text: "Completed React performance lesson", time: "Yesterday" },
  { icon: "interview", text: "Finished a technical mock interview", time: "Oct 28" },
];
