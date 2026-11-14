"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { demoService } from "@/lib/mock-service";

export type AuthMode = "role" | "signup" | "recruiterSignup" | "login" | "forgot" | "setup";

function AuthFrame({ children, title, detail, back = "/" }: { children: React.ReactNode; title: string; detail: string; back?: string }) {
  return <main className="grid min-h-screen bg-white lg:grid-cols-[.9fr_1.1fr]"><aside className="relative hidden overflow-hidden bg-[#f0ecff] p-10 lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-36 -top-28 size-[460px] rounded-full bg-[#dfd7ff] blur-3xl" /><div className="relative"><Link href="/" className="inline-flex items-center gap-2 font-bold"><span className="grid size-9 place-items-center rounded-xl bg-[#7559e8] text-white"><Sparkles size={18} /></span>SkillBridge <span className="-ml-2 text-[#7d63df]">AI</span></Link></div><div className="relative max-w-md"><span className="grid size-12 place-items-center rounded-2xl bg-white text-[#7559e8] shadow-sm"><Sparkles size={22} /></span><h2 className="mt-6 text-4xl font-semibold leading-tight tracking-[-.04em]">Turn your next step into a plan.</h2><p className="mt-4 text-sm leading-6 text-[#777087]">Understand your strengths, grow the skills that matter, and approach new opportunities with confidence.</p><div className="mt-8 rounded-2xl border border-white/80 bg-white/70 p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#f2efff] text-[#7158d8]"><Check size={17} /></span><div><p className="text-xs font-semibold">Your demo workspace is ready</p><p className="mt-1 text-[10px] text-[#898296]">Explore sample career journeys and recruiter tools.</p></div></div></div></div><p className="relative text-[10px] text-[#918a9d]">Demo authentication · No real account is created</p></aside><section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8"><div className="w-full max-w-[440px]"><Link href={back} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#827b91] hover:text-[#654ccc]"><ArrowLeft size={14} /> Back</Link><Link href="/" className="mt-6 flex items-center gap-2 font-bold lg:hidden"><span className="grid size-8 place-items-center rounded-lg bg-[#7559e8] text-white"><Sparkles size={15} /></span>SkillBridge AI</Link><h1 className="mt-7 text-2xl font-semibold tracking-[-.04em]">{title}</h1><p className="mt-2 text-sm leading-6 text-[#827b91]">{detail}</p>{children}<p className="mt-7 text-center text-[10px] leading-5 text-[#a09aab]">This is a frontend demo. Authentication and account recovery are not connected to a backend.</p></div></section></main>;
}

export function AuthFlow({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Candidate");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const profile = demoService.getProfile();
      if (profile) {
        setName(profile.name);
        setEmail(profile.email);
        setRole(profile.role);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  if (mode === "role") return <AuthFrame title="Choose your workspace" detail="What brings you to SkillBridge today?"><div className="mt-6 space-y-3"><Link href="/auth/signup" className="group flex items-center gap-4 rounded-2xl border border-[#eae6f2] p-4 hover:border-[#c9bdf3] hover:bg-[#fcfbff]"><span className="grid size-11 place-items-center rounded-xl bg-[#f1edff] text-[#7258dc]"><UserRound size={20} /></span><span className="flex-1"><b className="block text-sm">I’m building my career</b><small className="mt-1 block text-xs text-[#8a8397]">Explore learning, interviews, and job opportunities.</small></span><ArrowRight size={17} className="text-[#9992a5] transition group-hover:translate-x-1" /></Link><Link href="/auth/signup/recruiter" className="group flex items-center gap-4 rounded-2xl border border-[#eae6f2] p-4 hover:border-[#c9bdf3] hover:bg-[#fcfbff]"><span className="grid size-11 place-items-center rounded-xl bg-[#edf7f1] text-[#418a63]"><Users size={20} /></span><span className="flex-1"><b className="block text-sm">I’m hiring talent</b><small className="mt-1 block text-xs text-[#8a8397]">Discover candidates and manage your sample pipeline.</small></span><ArrowRight size={17} className="text-[#9992a5] transition group-hover:translate-x-1" /></Link></div><p className="mt-5 text-center text-xs text-[#827b91]">Already have a demo profile? <Link href="/auth/login" className="font-semibold text-[#7056d5]">Log in</Link></p></AuthFrame>;

  if (mode === "forgot") return <AuthFrame title="Reset your password" detail="Enter your email and we’ll show a demo confirmation." back="/auth/login"><form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); setNotice("If this were a connected account, reset instructions would be sent to your email."); }}><label className="block text-xs font-semibold">Email address<span className="relative mt-2 block"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9891a5]" /><input required type="email" className="input pl-10 text-sm font-normal" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></span></label><Button type="submit" className="w-full">Continue <ArrowRight size={15} /></Button>{notice && <p role="status" className="rounded-xl bg-[#edf8f1] p-3 text-xs leading-5 text-[#347d55]">{notice}</p>}</form><p className="mt-5 text-center text-xs text-[#827b91]">Remembered it? <Link href="/auth/login" className="font-semibold text-[#7056d5]">Back to login</Link></p></AuthFrame>;

  if (mode === "setup") return <AuthFrame title="Complete your profile" detail="A couple of details help shape your demo workspace." back="/auth/role"><form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); demoService.saveDemoProfile({ name: name || "Alex Morgan", email: email || "alex@example.com", role }); setNotice("Your demo profile is saved in this browser."); setTimeout(() => router.push(role === "Recruiter" ? "/recruiter" : "/dashboard"), 650); }}><label className="block text-xs font-semibold">Your name<input required className="input mt-2 text-sm font-normal" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" /></label><label className="block text-xs font-semibold">What best describes you?<select className="input mt-2 text-sm font-normal" value={role} onChange={(e) => setRole(e.target.value)}><option>Candidate</option><option>Recruiter</option><option>Career explorer</option></select></label><label className="block text-xs font-semibold">Target role <span className="font-normal text-[#9891a5]">(optional)</span><input className="input mt-2 text-sm font-normal" placeholder="e.g. Frontend Engineer" /></label><Button type="submit" className="w-full">Save demo profile <ArrowRight size={15} /></Button>{notice && <p role="status" className="text-center text-xs text-[#39845d]">{notice}</p>}</form></AuthFrame>;

  const recruiter = mode === "recruiterSignup";
  const signup = mode === "signup" || recruiter;
  const title = signup ? recruiter ? "Create recruiter profile" : "Create your career profile" : "Welcome back";
  const detail = signup ? recruiter ? "Start exploring the sample recruiter workspace." : "Your next step starts with a few simple details." : "Log in to continue to your SkillBridge demo workspace.";
  return <AuthFrame title={title} detail={detail} back={signup ? "/auth/role" : "/"}>
    <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); const selectedRole = recruiter ? "Recruiter" : "Candidate"; if (signup) { demoService.saveDemoProfile({ name, email, role: selectedRole }); router.push("/auth/setup"); } else { const profile = demoService.getProfile(); demoService.saveDemoProfile({ name: profile?.name || email.split("@")[0] || "Alex Morgan", email, role: profile?.role || "Candidate" }); router.push(profile?.role === "Recruiter" ? "/recruiter" : "/dashboard"); } }}>
      {signup && <label className="block text-xs font-semibold">{recruiter ? "Full name" : "Your name"}<span className="relative mt-2 block"><UserRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9891a5]" /><input required className="input pl-10 text-sm font-normal" placeholder="Alex Morgan" value={name} onChange={(e) => setName(e.target.value)} /></span></label>}
      {recruiter && <label className="block text-xs font-semibold">Company<input required className="input mt-2 text-sm font-normal" placeholder="Company name" /></label>}
      <label className="block text-xs font-semibold">Email address<span className="relative mt-2 block"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9891a5]" /><input required type="email" className="input pl-10 text-sm font-normal" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></span></label>
      <label className="block text-xs font-semibold">Password<span className="relative mt-2 block"><LockKeyhole size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9891a5]" /><input required type={showPassword ? "text" : "password"} minLength={6} className="input pl-10 pr-11 text-sm font-normal" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#918a9d]">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
      {!signup && <div className="-mt-1 flex justify-end"><Link href="/auth/forgot" className="text-xs font-semibold text-[#7056d5]">Forgot password?</Link></div>}
      <Button type="submit" className="w-full">{signup ? "Create demo account" : "Log in to demo"} <ArrowRight size={15} /></Button>
      {signup && <p className="text-center text-[10px] leading-5 text-[#9a93a6]">By continuing, you agree to the demo terms. This flow does not create a real account.</p>}
    </form>
    <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wide text-[#a39cad]"><span className="h-px flex-1 bg-[#eeeaf4]" />or<span className="h-px flex-1 bg-[#eeeaf4]" /></div>
    <button onClick={() => router.push("/auth/setup")} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e9e5ef] px-4 py-3 text-xs font-semibold hover:bg-[#faf9fc]"><Sparkles size={15} className="text-[#765bdc]" /> Continue with demo profile</button>
    <p className="mt-5 text-center text-xs text-[#827b91]">{signup ? "Already have a demo profile?" : "New to SkillBridge?"} <Link href={signup ? "/auth/login" : "/auth/role"} className="font-semibold text-[#7056d5]">{signup ? "Log in" : "Choose a workspace"}</Link></p>
  </AuthFrame>;
}
