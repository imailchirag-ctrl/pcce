"use client";

import Editor, { loader } from "@monaco-editor/react";

loader.config({ paths: { vs: "/monaco/vs" } });

export function CareerQuestCodeEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#332F2A] bg-[#1E1E1E]">
      <div className="flex h-9 items-center justify-between border-b border-white/10 px-3 text-[10px] text-white/65">
        <span>main.py</span>
        <span>Python · draft in this screen</span>
      </div>
      <Editor
        height="390px"
        language="python"
        theme="vs-dark"
        value={value}
        onChange={(next) => onChange(next ?? "")}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 4,
          padding: { top: 14, bottom: 14 },
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          accessibilitySupport: "auto",
        }}
      />
    </div>
  );
}
