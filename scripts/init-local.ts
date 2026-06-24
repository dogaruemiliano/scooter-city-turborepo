#!/usr/bin/env tsx
/**
 * First-clone local setup helper.
 *
 * Run via `pnpm init:local` after `pnpm install`.
 *
 * The script is intentionally not a Turborepo task: it creates ignored local
 * env files, starts Docker, and mutates the local database.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

interface Options {
  yes: boolean;
  projectName?: string;
  skipDocker: boolean;
  skipDb: boolean;
  skipSeed: boolean;
  skipBuild: boolean;
  regenSecrets: boolean;
  dryRun: boolean;
  help: boolean;
}

interface EnvFile {
  label: string;
  file: string;
  example: string;
}

interface EnvBlock {
  key: string;
  text: string;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const templatePackageName = "turborepo-full-template-v2";
const secretKeys = ["REFRESH_TOKEN_HMAC_SECRET", "OTP_HMAC_SECRET"] as const;

const envFiles: EnvFile[] = [
  {
    label: "API",
    file: resolve(root, "apps", "api", ".env"),
    example: resolve(root, "apps", "api", ".env.example"),
  },
  {
    label: "Web",
    file: resolve(root, "apps", "web", ".env"),
    example: resolve(root, "apps", "web", ".env.example"),
  },
];

function usage(): string {
  return `Usage: pnpm init:local [options]

Sets up a local development clone. Run after pnpm install.

Options:
  --yes           Accept safe defaults without prompting.
  --name <name>   Set the root package name and Docker container prefix.
  --skip-docker   Do not start Docker Compose.
  --skip-db       Skip migrations, Prisma generate, and seed.
  --skip-seed     Apply migrations and generate Prisma client, but skip seed.
  --skip-build    Skip shared package builds.
  --regen-secrets Regenerate local HMAC secrets in apps/api/.env.
  --dry-run       Print planned actions without writing files or running setup.
  --help          Show this help.
`;
}

function parseOptions(argv: string[]): Options {
  const options: Options = {
    yes: false,
    projectName: undefined,
    skipDocker: false,
    skipDb: false,
    skipSeed: false,
    skipBuild: false,
    regenSecrets: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith("--name=") || arg.startsWith("--project-name=")) {
      options.projectName = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    switch (arg) {
      case "--yes":
        options.yes = true;
        break;
      case "--name":
      case "--project-name": {
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) {
          throw new Error(`Missing value for ${arg}\n\n${usage()}`);
        }
        options.projectName = value;
        index += 1;
        break;
      }
      case "--skip-docker":
        options.skipDocker = true;
        break;
      case "--skip-db":
        options.skipDb = true;
        break;
      case "--skip-seed":
        options.skipSeed = true;
        break;
      case "--skip-build":
        options.skipBuild = true;
        break;
      case "--regen-secrets":
        options.regenSecrets = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    }
  }

  return options;
}

class Prompter {
  private readonly rl =
    input.isTTY && output.isTTY
      ? createInterface({ input, output })
      : undefined;

  constructor(private readonly options: Options) {}

  async confirm(question: string, defaultValue = true): Promise<boolean> {
    if (this.options.yes || !this.rl) {
      return defaultValue;
    }

    const suffix = defaultValue ? "Y/n" : "y/N";
    const answer = (await this.rl.question(`${question} (${suffix}) `))
      .trim()
      .toLowerCase();

    if (!answer) return defaultValue;
    return ["y", "yes"].includes(answer);
  }

  async text(
    question: string,
    defaultValue: string,
    validate: (value: string) => string | undefined,
  ): Promise<string> {
    if (this.options.yes || !this.rl) {
      return defaultValue;
    }

    while (true) {
      const answer = (
        await this.rl.question(`${question} (${defaultValue}) `)
      ).trim();
      const value = answer || defaultValue;
      const error = validate(value);
      if (!error) return value;
      warn(error);
    }
  }

  close(): void {
    this.rl?.close();
  }
}

function repoPath(path: string): string {
  return relative(root, path) || ".";
}

function log(message = ""): void {
  // eslint-disable-next-line no-console
  console.log(message);
}

function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`Warning: ${message}`);
}

function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function parseEnvKeys(content: string): Set<string> {
  const keys = new Set<string>();
  for (const line of normalizeNewlines(content).split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function parseEnvValues(content: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of normalizeNewlines(content).split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function parseExampleBlocks(content: string): EnvBlock[] {
  const blocks: EnvBlock[] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (!current.length) return;
    const keyLine = [...current]
      .reverse()
      .find((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line));
    const key = keyLine?.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (key) {
      blocks.push({ key, text: current.join("\n") });
    }
    current = [];
  };

  for (const line of normalizeNewlines(content).split("\n")) {
    if (!line.trim()) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  return blocks;
}

function readIfExists(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf8");
}

function defaultPackageNameFromDirectory(): string {
  const name = basename(root)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");

  return validatePackageName(name) ? "app" : name;
}

function packageNameSegmentError(segment: string): string | undefined {
  if (!segment) return "Package name segments cannot be empty.";
  if (segment.startsWith(".") || segment.startsWith("_")) {
    return "Package name segments cannot start with a dot or underscore.";
  }
  if (!/^[a-z0-9][a-z0-9._~-]*$/.test(segment)) {
    return "Package names can only contain lowercase letters, numbers, dots, underscores, hyphens, and tildes.";
  }
  return undefined;
}

function validatePackageName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Project name is required.";
  if (trimmed !== name)
    return "Project name cannot include leading or trailing whitespace.";
  if (trimmed.length > 214)
    return "Project name must be 214 characters or fewer.";
  if (trimmed !== trimmed.toLowerCase()) {
    return "Project name must be lowercase to be a valid npm package name.";
  }

  if (trimmed.startsWith("@")) {
    const parts = trimmed.split("/");
    if (parts.length !== 2) {
      return "Scoped package names must look like @scope/name.";
    }
    const scopeError = packageNameSegmentError(parts[0].slice(1));
    return scopeError ?? packageNameSegmentError(parts[1]);
  }

  if (trimmed.includes("/")) {
    return "Only scoped package names can include a slash.";
  }

  return packageNameSegmentError(trimmed);
}

function readPackageName(path: string): string | undefined {
  const content = readIfExists(path);
  if (content === undefined) return undefined;
  const parsed = JSON.parse(content) as { name?: unknown };
  return typeof parsed.name === "string" ? parsed.name : undefined;
}

async function resolveProjectName(
  prompter: Prompter,
  options: Options,
): Promise<string> {
  const packageJson = resolve(root, "package.json");
  const existingName = readPackageName(packageJson);
  const defaultName =
    existingName && existingName !== templatePackageName
      ? existingName
      : defaultPackageNameFromDirectory();
  if (options.projectName !== undefined) {
    const requestedName = options.projectName.trim();
    const error = validatePackageName(requestedName);
    if (error) throw new Error(error);
    return requestedName;
  }

  return prompter.text(
    "Project package name",
    defaultName,
    validatePackageName,
  );
}

function dockerContainerPrefix(projectName: string): string {
  const prefix = projectName
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "");

  return prefix || "app";
}

function ensurePackageName(projectName: string, options: Options): void {
  const packageJson = resolve(root, "package.json");
  const content = readIfExists(packageJson);
  if (content === undefined) {
    throw new Error(`Missing ${repoPath(packageJson)}`);
  }

  const parsed = JSON.parse(content) as { name?: string };
  if (parsed.name === projectName) {
    log(`${repoPath(packageJson)} already uses project name ${projectName}.`);
    return;
  }

  if (options.dryRun) {
    log(`[dry-run] Would set ${repoPath(packageJson)} name to ${projectName}`);
    return;
  }

  parsed.name = projectName;
  writeFileSync(packageJson, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  log(`Set ${repoPath(packageJson)} name to ${projectName}`);
}

function ensureDockerContainerName(
  projectName: string,
  options: Options,
): void {
  const composeFile = resolve(root, "docker-compose.yml");
  const content = readIfExists(composeFile);
  if (content === undefined) {
    throw new Error(`Missing ${repoPath(composeFile)}`);
  }

  const containerName = `${dockerContainerPrefix(projectName)}-postgres`;
  const nextContent = content.replace(
    /^(\s*container_name:\s*).+$/m,
    `$1${containerName}`,
  );

  if (nextContent === content) {
    if (content.includes(`container_name: ${containerName}`)) {
      log(
        `${repoPath(composeFile)} already uses Postgres container ${containerName}.`,
      );
      return;
    }
    throw new Error(`Missing container_name in ${repoPath(composeFile)}`);
  }

  if (options.dryRun) {
    log(
      `[dry-run] Would set ${repoPath(
        composeFile,
      )} Postgres container_name to ${containerName}`,
    );
    return;
  }

  writeFileSync(composeFile, nextContent, "utf8");
  log(`Set Postgres container_name to ${containerName}`);
}

function ensureProjectNaming(projectName: string, options: Options): void {
  ensurePackageName(projectName, options);
  ensureDockerContainerName(projectName, options);
}

function isNonEmptyEnvValue(value: string | undefined): boolean {
  const trimmed = value?.trim();
  return Boolean(trimmed && trimmed !== '""' && trimmed !== "''");
}

function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

function upsertEnvValue(
  path: string,
  key: string,
  value: string,
  options: Options,
): void {
  const content = readIfExists(path);
  if (content === undefined) {
    if (options.dryRun) {
      log(`[dry-run] Would add ${key} to ${repoPath(path)}`);
      return;
    }
    writeFileSync(path, `${key}=${value}\n`, "utf8");
    return;
  }

  const lines = normalizeNewlines(content).split("\n");
  const index = lines.findIndex((line) =>
    new RegExp(`^\\s*${key}\\s*=`).test(line),
  );

  if (options.dryRun) {
    log(`[dry-run] Would set ${key} in ${repoPath(path)}`);
    return;
  }

  if (index >= 0) {
    lines[index] = `${key}=${value}`;
  } else {
    if (lines.length && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push("# Added by pnpm init:local");
    lines.push(`${key}=${value}`);
  }

  writeFileSync(path, lines.join("\n").replace(/\n*$/, "\n"), "utf8");
}

async function ensureEnvFile(
  envFile: EnvFile,
  prompter: Prompter,
  options: Options,
): Promise<boolean> {
  const exampleContent = readIfExists(envFile.example);
  if (exampleContent === undefined) {
    throw new Error(`Missing ${repoPath(envFile.example)}`);
  }

  const existingContent = readIfExists(envFile.file);
  if (existingContent === undefined) {
    const create = await prompter.confirm(
      `Create ${repoPath(envFile.file)} from ${repoPath(envFile.example)}?`,
      true,
    );
    if (!create) {
      warn(`${repoPath(envFile.file)} was not created.`);
      return false;
    }

    if (options.dryRun) {
      log(
        `[dry-run] Would create ${repoPath(envFile.file)} from ${repoPath(
          envFile.example,
        )}`,
      );
      return true;
    }

    writeFileSync(envFile.file, exampleContent, "utf8");
    log(`Created ${repoPath(envFile.file)}`);
    return true;
  }

  const existingKeys = parseEnvKeys(existingContent);
  const missingBlocks = parseExampleBlocks(exampleContent).filter(
    (block) => !existingKeys.has(block.key),
  );

  if (!missingBlocks.length) {
    log(`${repoPath(envFile.file)} already has all example keys.`);
    return true;
  }

  const merge = await prompter.confirm(
    `Merge ${missingBlocks.length} missing ${envFile.label} env key(s) into ${repoPath(
      envFile.file,
    )} without changing existing values?`,
    true,
  );

  if (!merge) {
    warn(`${repoPath(envFile.file)} is missing keys from the example file.`);
    return true;
  }

  const addition = [
    "",
    "# Added by pnpm init:local from .env.example",
    ...missingBlocks.map((block) => block.text),
  ].join("\n\n");

  if (options.dryRun) {
    log(
      `[dry-run] Would append ${missingBlocks
        .map((block) => block.key)
        .join(", ")} to ${repoPath(envFile.file)}`,
    );
    return true;
  }

  writeFileSync(
    envFile.file,
    `${existingContent.replace(/\n*$/, "\n")}${addition}\n`,
    "utf8",
  );
  log(`Merged missing keys into ${repoPath(envFile.file)}`);
  return true;
}

async function ensureLocalSecrets(
  apiEnvFile: string,
  prompter: Prompter,
  options: Options,
): Promise<void> {
  const content = readIfExists(apiEnvFile);
  if (content === undefined) {
    if (options.dryRun) {
      log(
        "[dry-run] Would generate local HMAC secrets after creating API env.",
      );
      return;
    }
    throw new Error(`${repoPath(apiEnvFile)} is required to generate secrets.`);
  }

  const values = parseEnvValues(content);
  const missing = secretKeys.filter(
    (key) => options.regenSecrets || !isNonEmptyEnvValue(values.get(key)),
  );

  if (!missing.length) {
    log("Local HMAC secrets are already set.");
    return;
  }

  const action = options.regenSecrets ? "Regenerate" : "Generate";
  const generate = await prompter.confirm(
    `${action} local HMAC secret(s) for ${missing.join(", ")}?`,
    true,
  );

  if (!generate) {
    warn(
      `${missing.join(
        ", ",
      )} still need values before the API can run with validated auth config.`,
    );
    return;
  }

  for (const key of missing) {
    upsertEnvValue(apiEnvFile, key, randomSecret(), options);
  }

  if (!options.dryRun) {
    log(
      `${options.regenSecrets ? "Regenerated" : "Generated"} ${missing.length} local HMAC secret(s).`,
    );
  }
}

function commandExists(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "ignore",
    shell: isWindows,
  });
  return result.status === 0;
}

function run(command: string, args: string[], options: Options): void {
  log(`$ ${[command, ...args].join(" ")}`);
  if (options.dryRun) return;

  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${[command, ...args].join(" ")} (exit ${result.status})`,
    );
  }
}

async function waitForPostgres(options: Options): Promise<void> {
  const args = [
    "compose",
    "exec",
    "-T",
    "postgres",
    "pg_isready",
    "-U",
    "app",
    "-d",
    "app",
  ];

  log("Waiting for local Postgres to become ready...");
  if (options.dryRun) {
    log(`[dry-run] Would poll: docker ${args.join(" ")}`);
    return;
  }

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = spawnSync("docker", args, {
      cwd: root,
      stdio: "ignore",
      shell: isWindows,
    });
    if (result.status === 0) {
      log("Postgres is ready.");
      return;
    }
    await delay(1_000);
  }

  throw new Error(
    "Postgres did not become ready in time. Check `docker compose ps` or rerun with --skip-db.",
  );
}

function assertApiEnvForDb(apiEnvReady: boolean, options: Options): void {
  if (apiEnvReady) return;
  if (options.dryRun) return;
  throw new Error(
    "apps/api/.env is required before running DB setup. Create it or rerun with --skip-db.",
  );
}

function smtpValuesAreBlank(apiEnvFile: string): boolean {
  const content = readIfExists(apiEnvFile);
  if (content === undefined) return true;
  const values = parseEnvValues(content);
  return ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"].some(
    (key) => !isNonEmptyEnvValue(values.get(key)),
  );
}

function printSummary(options: Options, apiEnvFile: string): void {
  log("");
  log(options.dryRun ? "Dry run complete." : "Local setup complete.");

  if (smtpValuesAreBlank(apiEnvFile)) {
    warn(
      "SMTP_* values are blank. API startup validates them, so fill real SMTP values or point them at a local SMTP capture service before relying on email delivery.",
    );
  }

  log("Next: pnpm dev");
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    log(usage());
    return;
  }

  log("Local project setup");
  if (options.dryRun) {
    log("Dry run mode: no files, services, or database state will be changed.");
  }
  log("");

  const prompter = new Prompter(options);

  try {
    const projectName = await resolveProjectName(prompter, options);
    ensureProjectNaming(projectName, options);

    const envReady = new Map<string, boolean>();
    for (const envFile of envFiles) {
      envReady.set(
        envFile.file,
        await ensureEnvFile(envFile, prompter, options),
      );
    }

    const apiEnvFile = envFiles[0].file;
    if (envReady.get(apiEnvFile)) {
      await ensureLocalSecrets(apiEnvFile, prompter, options);
    }

    if (!options.skipDocker) {
      if (!options.dryRun && !commandExists("docker", ["compose", "version"])) {
        throw new Error(
          "Docker Compose is required for local Postgres. Install Docker, start it, or rerun with --skip-docker / --skip-db.",
        );
      }
      run("docker", ["compose", "up", "-d", "postgres"], options);
      await waitForPostgres(options);
    }

    if (!options.skipDb) {
      assertApiEnvForDb(Boolean(envReady.get(apiEnvFile)), options);
      run("pnpm", ["--filter", "api", "db:deploy"], options);
      run("pnpm", ["--filter", "api", "db:generate"], options);
      if (!options.skipSeed) {
        run("pnpm", ["--filter", "api", "db:seed"], options);
      }
    }

    if (!options.skipBuild) {
      run("pnpm", ["--filter", "@repo/i18n", "build"], options);
      run("pnpm", ["--filter", "@repo/api-shared", "build"], options);
    }

    printSummary(options, apiEnvFile);
  } finally {
    prompter.close();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
