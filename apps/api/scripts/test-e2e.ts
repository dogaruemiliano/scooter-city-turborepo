import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { Client } from "pg";

type Env = NodeJS.ProcessEnv;
const apiDirectory = path.resolve(__dirname, "..");
const financeSuite = "finance-books.e2e-spec.ts";

export function readEnvFile(filename: string): Env {
  return existsSync(filename) ? parseEnv(readFileSync(filename, "utf8")) : {};
}

export function databaseIdentity(value: string): string {
  const url = new URL(value);
  const host = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ? "localhost"
    : url.hostname;
  return `${host}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
}

function testDatabaseUrl(name: string, value?: string): URL {
  if (!value?.trim()) {
    throw new Error(
      `${name} is required. Copy apps/api/.env.test.example to apps/api/.env.test, or set it in CI.`,
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a PostgreSQL connection URL.`);
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    Buffer.byteLength(database) > 63 ||
    !/(?:^|_)test(?:_|$)/.test(database) ||
    !/^[a-zA-Z0-9_]+$/.test(database)
  ) {
    throw new Error(
      `${name} must name a dedicated PostgreSQL database containing a separate 'test' name segment (for example scooter_city_test).`,
    );
  }
  return url;
}

export function configureTestEnvironment(
  shell: Env,
  file: Env,
  application: Env,
): { env: Env; general: URL; finance: URL } {
  const env = { ...file, ...shell };
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to prepare E2E databases with NODE_ENV=production.",
    );
  }
  const general = testDatabaseUrl("E2E_DATABASE_URL", env.E2E_DATABASE_URL);
  const finance = testDatabaseUrl(
    "E2E_FINANCE_DATABASE_URL",
    env.E2E_FINANCE_DATABASE_URL,
  );
  if (!finance.pathname.startsWith("/finance_books_test")) {
    throw new Error(
      "E2E_FINANCE_DATABASE_URL must name finance_books_test or finance_books_test_<suffix>.",
    );
  }
  const targets = [general, finance].map((url) => databaseIdentity(url.href));
  if (targets[0] === targets[1]) {
    throw new Error("General and finance E2E databases must be different.");
  }
  for (const value of [shell.DATABASE_URL, application.DATABASE_URL]) {
    if (value && targets.includes(databaseIdentity(value))) {
      throw new Error(
        "An E2E database matches the application DATABASE_URL. Choose dedicated test databases.",
      );
    }
  }
  // DATABASE_URL is set explicitly on every subprocess. Prisma's dotenv/config
  // cannot replace it with the application .env value.
  return { env: { ...env, NODE_ENV: "test" }, general, finance };
}

export function selectSuites(filenames: string[], filters: string[]) {
  if (filters.some((filter) => filter.startsWith("-"))) {
    throw new Error(
      "test:e2e accepts suite filename regexes, for example: pnpm --filter api test:e2e persons.",
    );
  }
  const patterns = filters.map((filter) => new RegExp(filter));
  const selected = filenames
    .filter((filename) => filename.endsWith(".e2e-spec.ts"))
    .filter(
      (filename) =>
        !patterns.length ||
        patterns.some((pattern) => pattern.test(`test/${filename}`)),
    )
    .sort();
  if (!selected.length)
    throw new Error("No E2E suites match the supplied filters.");
  return {
    general: selected.filter((filename) => filename !== financeSuite),
    finance: selected.filter((filename) => filename === financeSuite),
  };
}

export function financeRunUrl(template: URL, suffix: string): URL {
  const url = new URL(template);
  // PostgreSQL identifiers are limited to 63 bytes. Never reuse the template DB.
  url.pathname = `/${template.pathname.slice(1, 36)}_${suffix}`;
  return url;
}

export type RunnerDependencies = {
  run: (args: string[], env: Env) => Promise<number>;
  ensureGeneral: (url: URL) => Promise<void>;
  createFinance: (url: URL) => Promise<void>;
  dropFinance: (url: URL) => Promise<void>;
};

/** Aggregate connection errors may have an empty message (for example IPv4/IPv6 refusal). */
export function formatE2eError(error: unknown): string {
  const details =
    error instanceof AggregateError
      ? [...new Set(error.errors.map(formatE2eError))].join("; ")
      : error instanceof Error
        ? error.message.trim()
        : "";
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";
  const message =
    [code, details].filter(Boolean).join(": ") || "E2E runner failed.";
  // Diagnostic output must not expose connection credentials or URL query secrets.
  return message.replace(
    /postgres(?:ql)?:\/\/[^\s]+/gi,
    "[redacted database URL]",
  );
}

async function prepareDatabase(url: URL, prepare: (url: URL) => Promise<void>) {
  try {
    await prepare(url);
  } catch (error) {
    const localTestServer =
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.port === "55434";
    throw new Error(
      `E2E database preparation failed for ${databaseIdentity(url.href)}: ${formatE2eError(error)}. ` +
        (localTestServer
          ? "Start the test server from the repository root: docker compose --profile test up -d --wait postgres-test"
          : "Check that the configured test PostgreSQL server is running and accessible."),
      { cause: error },
    );
  }
}

export async function runE2e(
  config: ReturnType<typeof configureTestEnvironment>,
  suites: ReturnType<typeof selectSuites>,
  dependencies: RunnerDependencies,
): Promise<number> {
  const { run } = dependencies;
  const generalEnv = { ...config.env, DATABASE_URL: config.general.href };
  // Prisma 7: migrate deploy does not generate artifacts or seed. Keep both
  // explicit, and let Turbo restore the client only when its schema/config and
  // installed dependency inputs match. Direct package runs use the same prep.
  // Verified 2026-10-30: https://www.prisma.io/docs/cli/v7/migrate/deploy
  const prepare = async (args: string[], env = generalEnv) => {
    if (await run(args, env))
      throw new Error(`E2E preparation failed: pnpm ${args.join(" ")}`);
  };
  await prepare([
    "--workspace-root",
    "exec",
    "turbo",
    "run",
    "build",
    "--filter=api^...",
  ]);
  await prepare([
    "--workspace-root",
    "exec",
    "turbo",
    "run",
    "db:generate",
    "--filter=api",
  ]);
  const jest = (filenames: string[], env: Env) =>
    run(
      [
        "exec",
        "jest",
        "--config",
        "test/jest-e2e.json",
        "--runInBand",
        "--watchman=false",
        "--runTestsByPath",
        ...filenames.map((filename) => `test/${filename}`),
      ],
      {
        ...env,
        NODE_OPTIONS:
          `${env.NODE_OPTIONS || ""} --experimental-vm-modules`.trim(),
      },
    );
  let status = 0;
  if (suites.general.length) {
    await prepareDatabase(config.general, dependencies.ensureGeneral);
    await prepare(["run", "db:deploy"]);
    await prepare(["run", "db:seed"]);
    status = await jest(suites.general, generalEnv);
  }
  if (suites.finance.length) {
    const finance = financeRunUrl(
      config.finance,
      randomUUID().replaceAll("-", "").slice(0, 16),
    );
    const financeEnv = { ...config.env, DATABASE_URL: finance.href };
    await prepareDatabase(finance, dependencies.createFinance);
    try {
      await prepare(["run", "db:deploy"], financeEnv);
      const financeStatus = await jest(suites.finance, financeEnv);
      status ||= financeStatus;
    } finally {
      await dependencies.dropFinance(finance);
    }
  }
  return status;
}

async function ensureGeneralDatabase(url: URL) {
  const target = testDatabaseUrl("E2E_DATABASE_URL", url.href);
  const name = decodeURIComponent(target.pathname.slice(1));
  const admin = new URL(target);
  admin.pathname = "/postgres";
  const client = new Client({
    connectionString: admin.href,
    connectionTimeoutMillis: 5_000,
  });
  try {
    await client.connect();
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (existing.rowCount) return;
    console.log(`[e2e] Creating dedicated general test database ${name}`);
    try {
      // Identifier is restricted to letters, digits and underscores above.
      await client.query(`CREATE DATABASE "${name}"`);
    } catch (error: unknown) {
      // Another runner may have created the same database after our lookup.
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "42P04"
      )
        throw error;
    }
  } finally {
    await client.end();
  }
}

async function financeDatabase(url: URL, operation: "create" | "drop") {
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({
    connectionString: admin.href,
    connectionTimeoutMillis: 5_000,
  });
  try {
    await client.connect();
    const name = url.pathname.slice(1);
    if (!/^finance_books_test[a-zA-Z0-9_]*_[a-f0-9]{16}$/.test(name)) {
      throw new Error(
        "Refusing to manage a database without a generated finance test name.",
      );
    }
    // Identifier is generated and validated above; never drop the template DB.
    console.log(
      `[e2e] ${operation === "create" ? "Creating" : "Removing"} temporary finance database ${name}`,
    );
    await client.query(
      operation === "create"
        ? `CREATE DATABASE "${name}"`
        : `DROP DATABASE "${name}" WITH (FORCE)`,
    );
  } finally {
    await client.end();
  }
}

export async function main() {
  const config = configureTestEnvironment(
    process.env,
    readEnvFile(path.join(apiDirectory, ".env.test")),
    readEnvFile(path.join(apiDirectory, ".env")),
  );
  const suites = selectSuites(
    readdirSync(path.join(apiDirectory, "test"), {
      recursive: true,
      encoding: "utf8",
    }),
    process.argv.slice(2),
  );
  let child: ReturnType<typeof spawn> | undefined;
  let interrupted = false;
  const stop = (signal: NodeJS.Signals) => {
    interrupted = true;
    child?.kill(signal);
  };
  const onInterrupt = () => stop("SIGINT");
  const onTerminate = () => stop("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    return await runE2e(config, suites, {
      ensureGeneral: ensureGeneralDatabase,
      createFinance: (url) => financeDatabase(url, "create"),
      dropFinance: (url) => financeDatabase(url, "drop"),
      run: (args, env) =>
        new Promise((resolve, reject) => {
          if (interrupted) return reject(new Error("E2E run interrupted."));
          child = spawn("pnpm", args, {
            cwd: apiDirectory,
            env,
            stdio: "inherit",
          });
          child.once("error", reject);
          child.once("exit", (code, signal) => {
            child = undefined;
            if (signal || interrupted)
              reject(new Error("E2E run interrupted."));
            else resolve(code ?? 1);
          });
        }),
    });
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

if (require.main === module) {
  main()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error: unknown) => {
      console.error(formatE2eError(error));
      process.exitCode = 1;
    });
}
