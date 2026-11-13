"use client";

const prefix = "skillbridge-demo:";
function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(prefix + key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (typeof window !== "undefined") window.localStorage.setItem(prefix + key, JSON.stringify(value));
}

export const demoService = {
  getSavedJobs: () => read<string[]>("saved-jobs", []),
  toggleSavedJob(id: string) {
    const saved = this.getSavedJobs();
    const next = saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id];
    write("saved-jobs", next);
    return next;
  },
  getApplications: () => read<Record<string, string>>("applications", {}),
  applyToJob(id: string) {
    const applications = this.getApplications();
    if (!applications[id]) {
      applications[id] = "Applied";
      write("applications", applications);
    }
    return applications;
  },
  getRoadmap: <T,>(fallback: T) => read("roadmap", fallback),
  saveRoadmap<T>(roadmap: T) { write("roadmap", roadmap); },
  getShortlisted: () => read<string[]>("shortlisted", []),
  toggleShortlisted(id: string) {
    const current = this.getShortlisted();
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    write("shortlisted", next);
    return next;
  },
  saveDemoProfile(profile: { name: string; email: string; role: string }) {
    write("profile", profile);
    write("demo-session", { email: profile.email, name: profile.name, role: profile.role });
  },
  getProfile: () => read<{ name: string; email: string; role: string } | null>("profile", null),
  saveInterview(report: { type: string; score: number; date: string }) {
    const reports = read<typeof report[]>("interviews", []);
    write("interviews", [report, ...reports].slice(0, 10));
  },
  getInterviews: () => read<{ type: string; score: number; date: string }[]>("interviews", []),
  setInterviewType(type: string) { write("interview-type", type); },
  getInterviewType: () => read("interview-type", "Technical interview"),
};
