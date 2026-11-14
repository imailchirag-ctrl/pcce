import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : "";
  const problem = typeof body.problem === "string" ? body.problem : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!problem || !code) {
    return NextResponse.json({ error: "A challenge and code answer are required." }, { status: 400 });
  }

  const uncommentedCode = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const source = uncommentedCode.toLowerCase();
  const checks: Array<{ label: string; passed: boolean }> = [
    { label: "Contains a function", passed: /function\s+\w+\s*\(|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/m.test(uncommentedCode) },
    { label: "Returns a result", passed: /\breturn\b/.test(source) },
    { label: "Includes implementation logic", passed: uncommentedCode.replace(/function\s+\w+\s*\([^)]*\)\s*\{?|=>\s*\{?/, "").replace(/[\s{};]/g, "").length >= 8 },
    { label: "Has balanced braces", passed: (uncommentedCode.match(/\{/g) ?? []).length === (uncommentedCode.match(/\}/g) ?? []).length },
    { label: "Has balanced parentheses", passed: (uncommentedCode.match(/\(/g) ?? []).length === (uncommentedCode.match(/\)/g) ?? []).length },
  ];
  const challenge = `${title} ${problem}`.toLowerCase();
  let challengeChecks: Array<{ label: string; passed: boolean }> = [];

  if (challenge.includes("sum the even")) {
    challengeChecks = [
      { label: "Checks whether a value is even", passed: /%\s*2|iseven/.test(source) },
      { label: "Processes the input values", passed: /filter|reduce|for\s*\(|for\s+\w+|while\s*\(/.test(source) },
      { label: "Accumulates a sum", passed: /\+=|\.reduce|sum\s*=|return\s+.*sum/.test(source) },
    ];
  } else if (challenge.includes("reverse a string")) {
    challengeChecks = [
      { label: "Reverses the character order", passed: /\.reverse\s*\(|charat|charAt|\[.*length\s*-\s*1/.test(source) },
      { label: "Builds or returns a string", passed: /join\s*\(|split\s*\(|result\s*\+|reversed/.test(source) },
      { label: "Returns the reversed value", passed: /return\s+/.test(source) },
    ];
  } else if (challenge.includes("count vowels")) {
    challengeChecks = [
      { label: "Identifies vowel characters", passed: /[aeiou]{2}|["'`][aeiou]["'`]|includes\s*\(|match\s*\(|test\s*\(/i.test(uncommentedCode) },
      { label: "Counts matching characters", passed: /count|reduce|filter|\+\+|\+=/.test(source) },
      { label: "Handles letter case", passed: /tolowercase|touppercase/.test(source) || /[aeiou][\s\S]*[aeiou]/i.test(uncommentedCode) },
    ];
  } else if (challenge.includes("largest number")) {
    challengeChecks = [
      { label: "Compares candidate values", passed: /math\.max|>|<|sort\s*\(/.test(source) },
      { label: "Iterates or spreads the numbers", passed: /for\s*\(|for\s+\w+|reduce|\.\.\.|math\.max/.test(source) },
      { label: "Returns a maximum value", passed: /return\s+/.test(source) && /max|largest|result|numbers/.test(source) },
    ];
  } else if (challenge.includes("remove duplicates")) {
    challengeChecks = [
      { label: "Uses a uniqueness check", passed: /new\s+set|\.has\s*\(|indexof|includes\s*\(/.test(source) },
      { label: "Builds a result collection", passed: /\.filter|\.map|\.add\s*\(|\.push\s*\(|\.from\s*\(/.test(source) },
      { label: "Preserves input order", passed: /set|filter|indexof|includes/.test(source) },
    ];
  } else if (challenge.includes("fizzbuzz")) {
    challengeChecks = [
      { label: "Checks multiples of 3 and 5", passed: /%\s*3/.test(source) && /%\s*5/.test(source) },
      { label: "Handles the combined FizzBuzz case", passed: /fizzbuzz/.test(source) },
      { label: "Builds values across the range", passed: /for\s*\(|for\s+\w+|while\s*\(/.test(source) && /push|result|map/.test(source) },
    ];
  } else if (challenge.includes("palindrome")) {
    challengeChecks = [
      { label: "Compares characters from both ends", passed: /reverse|\[.*length\s*-\s*1|left|right/.test(source) },
      { label: "Handles letter case", passed: /tolowercase|touppercase/.test(source) },
      { label: "Returns a boolean result", passed: /return\s+(true|false)|return\s+\w+\s*===?/.test(source) },
    ];
  } else if (challenge.includes("character frequency")) {
    challengeChecks = [
      { label: "Checks characters against the target", passed: /target|===|==/.test(source) },
      { label: "Counts each matching occurrence", passed: /count|frequency|\+\+|\+=|reduce/.test(source) },
      { label: "Processes the input string", passed: /for\s*\(|for\s+\w+|split|filter|reduce/.test(source) },
    ];
  }

  checks.push(...challengeChecks);
  const score = Math.round(checks.filter((check) => check.passed).length / checks.length * 100);
  const passed = checks.filter((check) => check.passed).map((check) => `✓ ${check.label}`);
  const needsWork = checks.filter((check) => !check.passed).map((check) => `• ${check.label}`);
  const feedback = [
    `Code analysis: ${passed.length}/${checks.length} checks passed.`,
    ...(passed.length ? [`Passed:\n${passed.join("\n")}`] : []),
    ...(needsWork.length ? [`Review:\n${needsWork.join("\n")}`] : []),
    "This local review checks code structure and challenge-related patterns; it does not execute the code.",
  ].join("\n\n");

  return NextResponse.json({ score, correct: score === 100, feedback });
}
