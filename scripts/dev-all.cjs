const { spawn } = require("node:child_process");

const npmCli = process.env.npm_execpath;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = ["dev", "fastapi:dev"].map((script) => {
  const child = spawn(
    npmCli ? process.execPath : npmCommand,
    npmCli ? [npmCli, "run", script] : ["run", script],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: !npmCli && process.platform === "win32",
    },
  );

  child.on("error", (error) => {
    console.error(`Could not start npm run ${script}:`, error.message);
    stop(1);
  });

  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`npm run ${script} exited${signal ? ` with ${signal}` : ` with code ${code}`}.`);
      stop(code || 1);
    }
  });

  return child;
});

let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  process.exitCode = code;
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
