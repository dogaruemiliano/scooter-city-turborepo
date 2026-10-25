import { execFileSync, spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = {
  ...process.env,
  CI: "true",
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL || "https://api.ci.placeholder.invalid",
};

console.log(
  `[verify] Node ${process.version}; ${process.platform}/${process.arch}; ${availableParallelism()} CPUs`,
);
try {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const changes = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  console.log(
    `[verify] Commit ${sha}${changes ? " (with local changes)" : " (clean)"}`,
  );
} catch {
  console.log("[verify] Source snapshot without Git metadata");
}

const checks = [
  ["Lint", ["lint", "--force"]],
  ["Typecheck", ["check-types", "--force"]],
  ["Unit tests", ["test", "--force"]],
  ["Web production build", ["--filter", "web", "build"]],
  ["Database E2E tests", ["test:e2e"]],
];

for (const [name, args] of checks) {
  console.log(`\n[verify] ${name}: pnpm ${args.join(" ")}`);
  const result = spawnSync(pnpm, args, { cwd: root, env, stdio: "inherit" });
  if (result.error || result.signal || result.status !== 0) {
    console.error(
      `[verify] ${name} failed${result.error ? `: ${result.error.message}` : ""}`,
    );
    process.exit(result.status || 1);
  }
}
console.log(
  "\n[verify] All checks passed (including production build and database E2E tests).",
);
