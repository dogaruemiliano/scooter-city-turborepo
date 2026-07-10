const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const gitPath = path.join(root, ".git");

if (!fs.existsSync(gitPath)) {
  console.log("Skipping lefthook install: .git directory is not available.");
  process.exit(0);
}

const localBinary = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "lefthook.cmd" : "lefthook",
);
const command = fs.existsSync(localBinary) ? localBinary : "lefthook";
const result = spawnSync(command, ["install"], {
  cwd: root,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  console.error(`lefthook install terminated by signal ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
