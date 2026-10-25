import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  configureTestEnvironment,
  financeRunUrl,
  readEnvFile,
  runE2e,
  selectSuites,
  type RunnerDependencies,
} from "../../scripts/test-e2e";

const urls = {
  E2E_DATABASE_URL: "postgresql://app:app@localhost:5434/scooter_city_test",
  E2E_FINANCE_DATABASE_URL:
    "postgresql://app:app@localhost:5434/finance_books_test",
};
const suites: ReturnType<typeof selectSuites> = {
  general: ["persons.e2e-spec.ts"],
  finance: ["finance-books.e2e-spec.ts"],
};

describe("E2E runner configuration", () => {
  it("reads a test dotenv file without mutating the process environment", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "e2e-config-"));
    const filename = path.join(directory, ".env.test");
    const original = process.env.E2E_DATABASE_URL;
    try {
      expect(readEnvFile(filename)).toEqual({});
      writeFileSync(
        filename,
        '# local settings\nE2E_DATABASE_URL="postgresql://host/test_db"\n',
      );
      expect(readEnvFile(filename).E2E_DATABASE_URL).toBe(
        "postgresql://host/test_db",
      );
      expect(process.env.E2E_DATABASE_URL).toBe(original);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it("lets shell/CI variables override the local test file and forces test mode", () => {
    const config = configureTestEnvironment(
      { ...urls, OTP_HMAC_SECRET: "ci-secret" },
      {
        ...urls,
        E2E_DATABASE_URL: "postgresql://local/other_test",
        OTP_HMAC_SECRET: "local-secret",
      },
      { DATABASE_URL: "postgresql://app:app@localhost:5434/app" },
    );
    expect(config.general.href).toBe(urls.E2E_DATABASE_URL);
    expect(config.env.OTP_HMAC_SECRET).toBe("ci-secret");
    expect(config.env.NODE_ENV).toBe("test");
  });

  it("never falls back to the application or generic DATABASE_URL", () => {
    expect(() =>
      configureTestEnvironment({ DATABASE_URL: urls.E2E_DATABASE_URL }, {}, {}),
    ).toThrow("E2E_DATABASE_URL is required");
  });

  it.each([
    "",
    "invalid-credential-sentinel",
    "https://host/scooter_city_test",
    "postgresql://host/app",
    "postgresql://host/contest",
    "postgresql://host/test%22db",
  ])("rejects an unsafe URL without echoing credentials: %s", (value) => {
    const load = () =>
      configureTestEnvironment({ ...urls, E2E_DATABASE_URL: value }, {}, {});
    expect(load).toThrow();
    expect(load).not.toThrow("invalid-credential-sentinel");
  });

  it("requires both database settings", () => {
    expect(() =>
      configureTestEnvironment(
        { E2E_DATABASE_URL: urls.E2E_DATABASE_URL },
        {},
        {},
      ),
    ).toThrow("E2E_FINANCE_DATABASE_URL is required");
  });

  it("rejects production mode", () => {
    expect(() =>
      configureTestEnvironment({ ...urls, NODE_ENV: "production" }, {}, {}),
    ).toThrow("NODE_ENV=production");
  });

  it("rejects the same database even with different credentials or schemas", () => {
    expect(() =>
      configureTestEnvironment(
        {
          ...urls,
          E2E_DATABASE_URL:
            "postgres://other:secret@127.0.0.1:5434/finance_books_test?schema=other",
        },
        {},
        {},
      ),
    ).toThrow("must be different");
  });

  it.each(["shell", "file"])(
    "rejects the application database configured in the %s",
    (source) => {
      const application = {
        DATABASE_URL:
          "postgres://different:secret@127.0.0.1:5434/scooter_city_test?schema=public",
      };
      expect(() =>
        configureTestEnvironment(
          source === "shell" ? { ...urls, ...application } : urls,
          {},
          source === "file" ? application : {},
        ),
      ).toThrow("matches the application DATABASE_URL");
    },
  );

  it("requires the finance suite's database naming convention", () => {
    expect(() =>
      configureTestEnvironment(
        { ...urls, E2E_FINANCE_DATABASE_URL: "postgresql://host/other_test" },
        {},
        {},
      ),
    ).toThrow("must name finance_books_test");
  });

  it("selects filename regexes and partitions the isolated suite", () => {
    const filenames = [...suites.general, ...suites.finance, "setup-env.ts"];
    expect(selectSuites(filenames, [])).toEqual(suites);
    expect(selectSuites(filenames, ["finance-books"])).toEqual({
      general: [],
      finance: suites.finance,
    });
    expect(selectSuites(filenames, ["test/persons.*"])).toEqual({
      general: suites.general,
      finance: [],
    });
    expect(() => selectSuites(filenames, ["missing"])).toThrow("No E2E suites");
    expect(() => selectSuites(filenames, ["--watch"])).toThrow(
      "suite filename regexes",
    );
  });

  it("generates a temporary finance name without modifying the template URL", () => {
    const template = new URL(urls.E2E_FINANCE_DATABASE_URL);
    const run = financeRunUrl(template, "1234567890abcdef");
    expect(run.pathname).toBe("/finance_books_test_1234567890abcdef");
    expect(template.href).toBe(urls.E2E_FINANCE_DATABASE_URL);
  });
});

describe("E2E runner lifecycle", () => {
  const config = () => configureTestEnvironment(urls, {}, {});
  const dependencies = () => ({
    run: jest
      .fn<
        ReturnType<RunnerDependencies["run"]>,
        Parameters<RunnerDependencies["run"]>
      >()
      .mockResolvedValue(0),
    ensureGeneral: jest
      .fn<
        ReturnType<RunnerDependencies["ensureGeneral"]>,
        Parameters<RunnerDependencies["ensureGeneral"]>
      >()
      .mockResolvedValue(undefined),
    createFinance: jest
      .fn<
        ReturnType<RunnerDependencies["createFinance"]>,
        Parameters<RunnerDependencies["createFinance"]>
      >()
      .mockResolvedValue(undefined),
    dropFinance: jest
      .fn<
        ReturnType<RunnerDependencies["dropFinance"]>,
        Parameters<RunnerDependencies["dropFinance"]>
      >()
      .mockResolvedValue(undefined),
  });

  it("migrates both groups, seeds only the general database, and isolates finance", async () => {
    const deps = dependencies();
    await expect(runE2e(config(), suites, deps)).resolves.toBe(0);
    const commands = deps.run.mock.calls;
    expect(
      commands.filter(([args]) => args.join(" ") === "run db:deploy"),
    ).toHaveLength(2);
    expect(
      commands.filter(([args]) => args.join(" ") === "run db:seed"),
    ).toEqual([
      [
        ["run", "db:seed"],
        expect.objectContaining({
          DATABASE_URL: urls.E2E_DATABASE_URL,
          NODE_ENV: "test",
        }),
      ],
    ]);
    const tests = commands.filter(([args]) => args[1] === "jest");
    expect(tests).toHaveLength(2);
    expect(tests[0][0]).toContain("test/persons.e2e-spec.ts");
    expect(tests[1][0]).toContain("test/finance-books.e2e-spec.ts");
    expect(tests[1][1].DATABASE_URL).toMatch(
      /\/finance_books_test_[a-f0-9]{16}$/,
    );
    expect(deps.dropFinance).toHaveBeenCalledWith(
      deps.createFinance.mock.calls[0][0],
    );
  });

  it("provisions the general database before applying migrations", async () => {
    const deps = dependencies();
    deps.run.mockImplementation((args) => {
      if (args.includes("db:deploy")) {
        expect(deps.ensureGeneral).toHaveBeenCalledWith(config().general);
      }
      return Promise.resolve(0);
    });
    await expect(runE2e(config(), suites, deps)).resolves.toBe(0);
    expect(deps.ensureGeneral).toHaveBeenCalledTimes(1);
  });

  it("does not provision a general database for finance-only runs", async () => {
    const deps = dependencies();
    await expect(
      runE2e(config(), { general: [], finance: suites.finance }, deps),
    ).resolves.toBe(0);
    expect(deps.ensureGeneral).not.toHaveBeenCalled();
  });

  it("stops before migration and Jest if database provisioning fails", async () => {
    const deps = dependencies();
    deps.ensureGeneral.mockRejectedValue(new Error("cannot provision"));
    await expect(runE2e(config(), suites, deps)).rejects.toThrow(
      "cannot provision",
    );
    expect(
      deps.run.mock.calls.some(([args]) =>
        args.some((arg) => ["db:deploy", "db:seed", "jest"].includes(arg)),
      ),
    ).toBe(false);
    expect(deps.createFinance).not.toHaveBeenCalled();
  });

  it("still runs finance and returns failure if general Jest fails", async () => {
    const deps = dependencies();
    deps.run.mockImplementation((args) =>
      Promise.resolve(args.includes("test/persons.e2e-spec.ts") ? 1 : 0),
    );
    await expect(runE2e(config(), suites, deps)).resolves.toBe(1);
    expect(deps.dropFinance).toHaveBeenCalledTimes(1);
  });

  it("propagates finance test failures", async () => {
    const deps = dependencies();
    deps.run.mockImplementation((args) =>
      Promise.resolve(args.includes("test/finance-books.e2e-spec.ts") ? 1 : 0),
    );
    await expect(runE2e(config(), suites, deps)).resolves.toBe(1);
    expect(deps.dropFinance).toHaveBeenCalledTimes(1);
  });

  it.each(["migration", "Jest interruption"])(
    "cleans up its created database after a finance %s failure",
    async (failure) => {
      const deps = dependencies();
      deps.run.mockImplementation((args, env) => {
        if (
          env.DATABASE_URL !== urls.E2E_DATABASE_URL &&
          args.includes(failure === "migration" ? "db:deploy" : "jest")
        )
          return Promise.reject(new Error("failed"));
        return Promise.resolve(0);
      });
      await expect(runE2e(config(), suites, deps)).rejects.toThrow("failed");
      expect(deps.dropFinance).toHaveBeenCalledTimes(1);
    },
  );

  it("never drops a database if its creation failed", async () => {
    const deps = dependencies();
    deps.createFinance.mockRejectedValue(new Error("cannot create"));
    await expect(
      runE2e(config(), { general: [], finance: suites.finance }, deps),
    ).rejects.toThrow("cannot create");
    expect(deps.dropFinance).not.toHaveBeenCalled();
  });

  it("stops before Jest if preparation fails", async () => {
    const deps = dependencies();
    deps.run.mockImplementation((args) =>
      Promise.resolve(args.includes("db:deploy") ? 1 : 0),
    );
    await expect(runE2e(config(), suites, deps)).rejects.toThrow(
      "E2E preparation failed",
    );
    expect(deps.run.mock.calls.some(([args]) => args.includes("jest"))).toBe(
      false,
    );
    expect(deps.createFinance).not.toHaveBeenCalled();
  });
});
