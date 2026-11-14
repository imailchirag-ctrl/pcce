import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center px-5 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eeeaff] text-[#7258dc]"><Sparkles size={21} /></span><p className="eyebrow mt-5">404 · Page not found</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">This page isn’t on your career map.</h1><p className="mt-3 text-sm text-muted-foreground">The link may have changed. Head back to your SkillBridge workspace.</p><Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#7257df] px-4 py-3 text-sm font-semibold text-white"><ArrowLeft size={15} /> Go to home</Link></div></main>;
}
