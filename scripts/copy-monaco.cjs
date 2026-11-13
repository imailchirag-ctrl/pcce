const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve(process.cwd(), "node_modules/monaco-editor/min/vs");
const destination = path.resolve(process.cwd(), "public/monaco/vs");

if (!fs.existsSync(source)) {
  throw new Error("Monaco assets are missing. Install project dependencies before starting the app.");
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
