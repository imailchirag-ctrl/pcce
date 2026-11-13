import type { Metadata, Viewport } from "next";
import "../global.css";
import { WorkspaceProvider } from "@/lib/workspace-provider";

export const metadata: Metadata = {
  title: "SkillBridge AI — Career intelligence, in real time",
  description:
    "A private career workspace that scores your resume, maps skill gaps, builds learning roadmaps, and coaches interviews with models running on your machine.",
};

export const viewport: Viewport = {
  themeColor: "#FFFCF6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400..800;1,400..800&family=Space+Grotesk:wght@400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
