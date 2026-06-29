// Bun supervisor for the manga-api Python service.
// Spawns python3 main.py, restarts on crash, logs to /tmp/manga-api.log.
// Port is fixed at 8000 (declared below for the dev.sh scanner).

/* eslint-disable @typescript-eslint/no-require-imports */

const PORT = 8000;
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PY = "/home/z/.venv/bin/python3";
const DIR = __dirname;
const MAIN = path.join(DIR, "main.py");
const LOG = "/tmp/manga-api.log";

let child = null;
let restartTimer = null;

function startChild() {
  const out = fs.createWriteStream(LOG, { flags: "a" });
  out.write(`\n[${new Date().toISOString()}] (re)starting manga-api\n`);
  child = spawn(PY, ["-u", MAIN], {
    cwd: DIR,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.on("exit", (code, signal) => {
    out.write(`[${new Date().toISOString()}] manga-api exited code=${code} signal=${signal}\n`);
    child = null;
    // Restart with backoff
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(startChild, 1000);
  });
  console.log(`[supervisor] manga-api spawned (pid=${child.pid}) on port ${PORT}`);
}

process.on("SIGTERM", () => {
  if (child) child.kill("SIGTERM");
  process.exit(0);
});
process.on("SIGINT", () => {
  if (child) child.kill("SIGTERM");
  process.exit(0);
});

startChild();

// Keep the bun process alive
setInterval(() => {}, 1000 << 8);
