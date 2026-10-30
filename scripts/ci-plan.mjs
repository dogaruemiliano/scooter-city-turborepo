import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const webShards = Array.from({ length: 4 }, (_, index) => ({
  id: `web-unit-${index + 1}`,
  name: `Web unit tests (${index + 1}/4)`,
  command: `pnpm exec turbo run test --filter=web -- --maxWorkers=75% --shard=${index + 1}/4`,
}));
export const checks = [
  { id: "lint", name: "Lint", command: "pnpm lint" },
  { id: "types", name: "Typecheck", command: "pnpm check-types" },
  {
    id: "unit",
    name: "API and shared unit tests",
    command: "pnpm exec turbo run test --filter='!web'",
  },
  ...webShards,
  {
    id: "web-build",
    name: "Web production build",
    command: "pnpm exec turbo run build --filter=web",
  },
];

export function readWorkspace() {
  return ["apps", "packages"].flatMap((directory) =>
    readdirSync(path.join(root, directory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const directoryPath = `${directory}/${entry.name}`;
        const manifest = JSON.parse(
          readFileSync(path.join(root, directoryPath, "package.json"), "utf8"),
        );
        return {
          name: manifest.name,
          directory: directoryPath,
          dependencies: Object.keys({
            ...manifest.dependencies,
            ...manifest.devDependencies,
            ...manifest.peerDependencies,
            ...manifest.optionalDependencies,
          }),
          hasTests: Boolean(manifest.scripts?.test),
        };
      }),
  );
}

export function createPlan(paths, workspace, full = false) {
  const all = () => ({ matrix: { include: checks }, e2e: true });
  if (full) return all();
  const affected = new Set();
  let sharedSourceTest = false;
  for (const filename of paths) {
    // Root configuration, workflow/scripts, and package metadata may alter any
    // check. Unknown paths also fall back to full verification.
    if (filename.endsWith("/package.json") || filename.endsWith("AGENTS.md"))
      return all();
    if (
      filename.startsWith("docs/") ||
      (!filename.includes("/") && /\.md$/i.test(filename))
    )
      continue;
    const owner = workspace.find((pkg) =>
      filename.startsWith(`${pkg.directory}/`),
    );
    if (!owner) return all();
    affected.add(owner.name);
    // These theme tests inspect UI sources outside their package dependency
    // graph. Keep this aligned with @repo/theme#test inputs in turbo.json.
    sharedSourceTest ||= [
      "packages/ui/src/components/bottom-sheet.tsx",
      "packages/ui/src/components/sheet-select.tsx",
    ].includes(filename);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const pkg of workspace) {
      if (
        !affected.has(pkg.name) &&
        pkg.dependencies.some((dependency) => affected.has(dependency))
      ) {
        affected.add(pkg.name);
        changed = true;
      }
    }
  }
  const selected = new Set();
  if (affected.size) {
    selected.add("lint");
    selected.add("types");
  }
  if (
    sharedSourceTest ||
    workspace.some(
      (pkg) => pkg.name !== "web" && pkg.hasTests && affected.has(pkg.name),
    )
  )
    selected.add("unit");
  if (affected.has("web")) {
    for (const shard of webShards) selected.add(shard.id);
    selected.add("web-build");
  }
  return {
    matrix: { include: checks.filter((check) => selected.has(check.id)) },
    e2e: affected.has("api"),
  };
}

export function main(env = process.env) {
  let plan;
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
    const base = event.pull_request?.base?.sha;
    if (
      env.GITHUB_EVENT_NAME !== "pull_request" ||
      !/^[a-f\d]{40}$/.test(base)
    ) {
      plan = createPlan([], [], true);
    } else {
      // PR checkout is GitHub's merge commit. Comparing its tree with the base
      // avoids merge-base discovery and works with checkout's shallow parents.
      // Disable rename detection so both sides of a move select their owners.
      const paths = execFileSync(
        "git",
        ["diff", "--name-only", "--no-renames", "-z", base, "HEAD", "--"],
        { cwd: root, encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean);
      plan = createPlan(paths, readWorkspace());
    }
  } catch (error) {
    console.warn(
      `[ci] Unable to determine changes; running all checks: ${error.message}`,
    );
    plan = createPlan([], [], true);
  }
  const hasChecks = plan.matrix.include.length > 0;
  const output = `matrix=${JSON.stringify(plan.matrix)}\nchecks=${hasChecks}\ne2e=${plan.e2e}\n`;
  console.log(
    `[ci] Checks: ${plan.matrix.include.map((check) => check.id).join(", ") || "none"}; database E2E: ${plan.e2e}`,
  );
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, output);
  return plan;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
