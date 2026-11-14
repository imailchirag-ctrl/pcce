import { NextResponse } from "next/server";

type GameMode = "coding" | "logical" | "gk";
type Question = { id: number; question: string; options: string[]; correct: number };

const facts: Array<[string, string, string[]]> = [
  ["Which data structure follows the First In, First Out (FIFO) rule?", "Queue", ["Stack", "Tree", "Graph"]],
  ["Which data structure follows the Last In, First Out (LIFO) rule?", "Stack", ["Queue", "Heap", "Graph"]],
  ["Which language is primarily used to style web pages?", "CSS", ["SQL", "Python", "Bash"]],
  ["Which protocol is used to securely browse websites?", "HTTPS", ["FTP", "SMTP", "Telnet"]],
  ["What does CPU stand for?", "Central Processing Unit", ["Computer Power Utility", "Core Program Upload", "Central Peripheral User"]],
  ["Which number system uses only 0 and 1?", "Binary", ["Decimal", "Hexadecimal", "Roman"]],
  ["Which language is commonly used to query relational databases?", "SQL", ["HTML", "CSS", "PNG"]],
  ["Which part of a URL indicates the communication protocol?", "The scheme", ["The fragment", "The query value", "The file extension"]],
  ["What does RAM provide to a computer?", "Temporary working memory", ["Permanent file storage", "A network connection", "Power conversion"]],
  ["Which is an example of an operating system?", "Linux", ["PostgreSQL", "React", "HTTP"]],
  ["What is the main purpose of DNS?", "Translate domain names to IP addresses", ["Encrypt every file", "Compile source code", "Compress images"]],
  ["Which HTML element is used for the largest standard heading?", "<h1>", ["<head>", "<title>", "<header>"]],
  ["Which HTTP status code usually means a resource was not found?", "404", ["200", "301", "500"]],
  ["Which HTTP method is commonly used to retrieve data?", "GET", ["PATCH", "DELETE", "CONNECT"]],
  ["What does API commonly stand for?", "Application Programming Interface", ["Automated Program Installation", "Applied Process Internet", "Application Package Index"]],
  ["Which one is a version control system?", "Git", ["Node.js", "Figma", "Nginx"]],
  ["In a relational database, what uniquely identifies a row?", "A primary key", ["A stylesheet", "A foreign server", "A cache miss"]],
  ["Which sorting algorithm repeatedly splits a list and merges sorted halves?", "Merge sort", ["Bubble sort", "Selection sort", "Linear search"]],
  ["What is the time complexity of binary search on a sorted array?", "O(log n)", ["O(n²)", "O(n)", "O(2ⁿ)"]],
  ["Which symbol commonly begins a single-line comment in JavaScript?", "//", ["<!--", "##", "\\"]],
  ["Which file format is commonly used for structured data exchanged by APIs?", "JSON", ["BMP", "MP3", "WAV"]],
  ["What does phishing attempt to do?", "Trick people into revealing sensitive information", ["Improve network speed", "Repair a hard drive", "Back up a database"]],
  ["What is two-factor authentication designed to add?", "A second proof of identity", ["A second username", "A faster internet connection", "An extra browser tab"]],
  ["Which is the strongest password choice?", "A long, unique passphrase", ["password123", "Your first name", "The same password used everywhere"]],
  ["What is an open-source software license for?", "Defining how software may be used and shared", ["Measuring processor speed", "Encrypting network traffic", "Naming a database table"]],
  ["Which cloud model provides virtual machines and storage as services?", "IaaS", ["HTML", "CSS", "DNS"]],
  ["What is a software bug?", "A defect that causes unintended behavior", ["A type of database key", "A network cable", "A programming language"]],
  ["Which device forwards traffic between separate networks?", "Router", ["Keyboard", "Monitor", "Microphone"]],
  ["What does a compiler generally do?", "Translates source code into another form", ["Routes packets between networks", "Stores browser cookies", "Draws user interface mockups"]],
  ["Which memory is typically faster and smaller than RAM, close to the CPU?", "Cache", ["Blu-ray", "Hard disk", "Flash drive"]],
  ["What does responsive web design help a page do?", "Adapt its layout to different screen sizes", ["Run without any HTML", "Replace a database", "Increase battery voltage"]],
  ["Which testing level focuses on a small isolated function or module?", "Unit testing", ["Acceptance testing", "Load testing", "Penetration testing"]],
  ["What is an algorithm?", "A defined sequence of steps for solving a problem", ["A physical network port", "A database brand", "A type of monitor"]],
  ["Which data format is designed to describe document structure with tags?", "HTML", ["SSH", "SQL", "JPEG"]],
  ["What does the 'S' in HTTPS indicate?", "Secure", ["Serverless", "Standard", "Synchronous"]],
  ["Which is a common benefit of database indexes?", "Faster lookups for indexed queries", ["Automatic encryption of every column", "Unlimited storage", "Removal of duplicate rows"]],
  ["What is machine learning?", "Methods that let computers learn patterns from data", ["A way to clean a keyboard", "A type of network cable", "A database backup format"]],
  ["Which unit is commonly used to measure network data rate?", "Bits per second", ["Pixels per inch", "Celsius", "Volts per meter"]],
  ["What is the purpose of a firewall?", "Control network traffic according to security rules", ["Cool the CPU", "Format source code", "Increase screen resolution"]],
  ["Which CSS property changes the text color?", "color", ["font-style", "text-align", "line-height"]],
  ["Which JavaScript keyword declares a block-scoped variable that can be reassigned?", "let", ["const", "static", "fixed"]],
  ["What is the purpose of an HTTPS certificate?", "Help authenticate a site and establish encrypted communication", ["Store all page images", "Make a site rank first in search", "Replace the domain name"]],
  ["Which data structure is commonly used to represent hierarchical data?", "Tree", ["Queue", "Stack", "Flat file"]],
  ["What does 'debugging' mean?", "Finding and fixing problems in a program", ["Designing a logo", "Compressing a video", "Installing a monitor"]],
  ["Which git command creates a local copy of a remote repository?", "git clone", ["git merge", "git stash", "git diff"]],
  ["What is an IP address used for?", "Identifying a device or network interface on an IP network", ["Naming a programming variable", "Styling a web page", "Compressing a file"]],
  ["Which approach helps prevent SQL injection?", "Parameterized queries", ["Building SQL with raw user input", "Hiding the submit button", "Using a longer table name"]],
  ["What does the viewport meta tag help control?", "How a page is sized on mobile screens", ["Database transaction speed", "Server password policy", "Image file format"]],
  ["Which protocol is commonly used to send email between mail servers?", "SMTP", ["DHCP", "SSH", "NTP"]],
];

const codingChallenges = [
  { title: "Sum the Even Numbers", problem: "Write a function that receives an array of integers and returns the sum of its even values.", examples: ["Input: [1, 2, 3, 4] Output: 6", "Input: [1, 3, 5] Output: 0"], starterCode: "function solve(numbers) {\n  // Return the sum of even numbers\n}\n" },
  { title: "Reverse a String", problem: "Write a function that returns the input string with its characters in reverse order.", examples: ["Input: \"hello\" Output: \"olleh\"", "Input: \"a\" Output: \"a\""], starterCode: "function solve(text) {\n  // Return the reversed string\n}\n" },
  { title: "Count Vowels", problem: "Write a function that counts the vowels (a, e, i, o, u) in a string, ignoring letter case.", examples: ["Input: \"SkillBridge\" Output: 3", "Input: \"rhythm\" Output: 0"], starterCode: "function solve(text) {\n  // Return the number of vowels\n}\n" },
  { title: "Find the Largest Number", problem: "Write a function that returns the largest number in a non-empty array.", examples: ["Input: [4, 9, 2] Output: 9", "Input: [-5, -2, -8] Output: -2"], starterCode: "function solve(numbers) {\n  // Return the largest number\n}\n" },
  { title: "Remove Duplicates", problem: "Write a function that returns a new array containing each input value once, preserving its first occurrence order.", examples: ["Input: [1, 2, 1, 3] Output: [1, 2, 3]", "Input: [\"a\", \"a\"] Output: [\"a\"]"], starterCode: "function solve(items) {\n  // Return unique items in order\n}\n" },
  { title: "FizzBuzz", problem: "For a positive integer n, return an array from 1 to n. Use 'Fizz' for multiples of 3, 'Buzz' for multiples of 5, and 'FizzBuzz' for both.", examples: ["Input: 5 Output: [1, 2, \"Fizz\", 4, \"Buzz\"]"], starterCode: "function solve(n) {\n  // Build and return the sequence\n}\n" },
  { title: "Palindrome Check", problem: "Write a function that returns true when a string reads the same forward and backward, ignoring case.", examples: ["Input: \"Level\" Output: true", "Input: \"hello\" Output: false"], starterCode: "function solve(text) {\n  // Return true or false\n}\n" },
  { title: "Character Frequency", problem: "Write a function that returns how many times the target character occurs in a string. Treat characters as case-sensitive.", examples: ["Input: (\"banana\", \"a\") Output: 3", "Input: (\"book\", \"z\") Output: 0"], starterCode: "function solve(text, target) {\n  // Return the number of matches\n}\n" },
];

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeQuestion(question: string, answer: string, distractors: string[]): Question {
  const candidates = [answer, ...new Set(distractors.filter((item) => item !== answer))];
  const numericAnswer = Number(answer);
  for (let offset = 1; candidates.length < 4; offset += 1) {
    const fallback = Number.isFinite(numericAnswer) ? String(numericAnswer + 1000 + offset) : `Alternative answer ${offset}`;
    if (!candidates.includes(fallback)) candidates.push(fallback);
  }
  const options = shuffle(candidates.slice(0, 4));
  return { id: 0, question, options, correct: options.indexOf(answer) };
}

function createLogicalPool(): Question[] {
  const questions: Question[] = [];
  for (let n = 4; n < 60; n += 1) {
    const step = 2 + Math.floor(Math.random() * 9);
    const start = 1 + Math.floor(Math.random() * 30);
    const answer = start + step * 5;
    questions.push(makeQuestion(
      `What number comes next in this sequence: ${start}, ${start + step}, ${start + 2 * step}, ${start + 3 * step}, ${start + 4 * step}, ?`,
      String(answer), [String(answer + step), String(answer - step), String(answer + 2)],
    ));
    const ratio = 2 + Math.floor(Math.random() * 4);
    const first = 1 + Math.floor(Math.random() * 5);
    const product = first * ratio ** 4;
    questions.push(makeQuestion(
      `Find the next number: ${first}, ${first * ratio}, ${first * ratio ** 2}, ${first * ratio ** 3}, ?`,
      String(product), [String(product + ratio), String(product / ratio), String(product - first)],
    ));
  }
  for (let i = 0; i < 40; i += 1) {
    const side = 3 + Math.floor(Math.random() * 24);
    const squares = [1, 2, 3, 4].map((offset) => (side + offset) ** 2);
    questions.push(makeQuestion(
      `Which number completes the pattern: ${squares[0]}, ${squares[1]}, ${squares[2]}, ?`,
      String(squares[3]), [String(squares[3] + 1), String((side + 4) * 2), String(squares[2] + 2)],
    ));
    const apples = 12 + Math.floor(Math.random() * 60);
    const people = 2 + Math.floor(Math.random() * 8);
    const remainder = apples % people;
    questions.push(makeQuestion(
      `A group shares ${apples} items equally among ${people} people. How many are left over?`,
      String(remainder), [String((remainder + 1) % people), String((remainder + 2) % people), String(people - remainder)],
    ));
  }
  return questions;
}

function chooseFresh(pool: Question[], previous: Set<string>): Question[] {
  const uniquePool = [...new Map(pool.map((item) => [item.question.toLocaleLowerCase(), item])).values()];
  const available = shuffle(uniquePool.filter((item) => !previous.has(item.question.toLocaleLowerCase())));
  const selected = available.slice(0, 10);
  if (selected.length < 10) {
    const chosen = new Set(selected.map((item) => item.question));
    selected.push(...shuffle(uniquePool.filter((item) => !chosen.has(item.question))).slice(0, 10 - selected.length));
  }
  return selected.map((item, index) => ({ ...item, id: index + 1 }));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const mode = body.mode as GameMode | null;
  if (!mode || !["coding", "logical", "gk"].includes(mode)) {
    return NextResponse.json({ error: "Choose coding, logical, or gk mode." }, { status: 400 });
  }

  if (mode === "coding") {
    const challenge = shuffle(codingChallenges)[0];
    return NextResponse.json(challenge, { headers: { "Cache-Control": "no-store" } });
  }

  const previous = new Set<string>(
    Array.isArray(body.previousQuestions)
      ? body.previousQuestions.filter((item: unknown): item is string => typeof item === "string").slice(-60).map((item: string) => item.toLocaleLowerCase())
      : [],
  );
  const pool = mode === "logical"
    ? createLogicalPool()
    : facts.map(([question, answer, distractors]) => makeQuestion(question, answer, distractors));
  const questions = chooseFresh(pool, previous);
  return NextResponse.json(questions, { headers: { "Cache-Control": "no-store" } });
}
