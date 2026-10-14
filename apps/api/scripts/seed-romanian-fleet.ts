/**
 * Local demonstration data, explicitly requested by the user.
 * Default: preview. Pass --apply to fill missing fleet numbers 001–038 and add
 * Romanian reports. Existing scooters, reports, memberships and permissions
 * are preserved. Deterministic IDs make repeat runs safe.
 *
 * Prisma 7: generated client + PostgreSQL driver adapter, with explicit pool
 * settings matching PrismaService. Number gaps are filled only for this
 * requested demonstration; ordinary scooter creation keeps using the counter.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { v1 } from "@repo/api-shared";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import {
  enforcePrerequisites,
  resolveScopes,
} from "../src/access/access.resolver";

const TARGET = 38;
const PREFIX = "demo-ro-fleet-v1";
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const target = new URL(url);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "5434" ||
  target.pathname !== "/app"
) {
  throw new Error(
    "This demonstration seed is restricted to the local app database on port 5434",
  );
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  }),
});

type ReportSeed = {
  number: number;
  key: string;
  title: string;
  description: string;
  severity: v1.problems.Problem["severity"];
  blocking: boolean;
  state: "open" | "in_progress" | "resolved" | "cancelled" | "reopened";
  assigned?: boolean;
  comment?: string;
  resolution?: string;
  retainHold?: boolean;
};
const reports: ReportSeed[] = [
  {
    number: 1,
    key: "frana-spate",
    title: "Frâna spate nu mai ține eficient",
    description:
      "Maneta frânei spate ajunge aproape de ghidon, iar distanța de oprire a crescut. Problema a fost observată la verificarea de dimineață. Scuterul nu trebuie predat până la verificarea frânei.",
    severity: "critical",
    blocking: true,
    state: "open",
    assigned: true,
  },
  {
    number: 2,
    key: "far",
    title: "Farul se stinge pe denivelări",
    description:
      "Faza scurtă se întrerupe când scuterul trece peste denivelări. Faza lungă funcționează, dar iluminarea nu este fiabilă pentru circulație.",
    severity: "high",
    blocking: true,
    state: "in_progress",
    assigned: true,
    comment:
      "Becul este funcțional. Verific mufa farului și continuitatea cablajului; întreruperea apare când se mișcă ghidonul.",
  },
  {
    number: 2,
    key: "semnalizare-spate",
    title: "Semnalizatorul dreapta spate nu funcționează",
    description:
      "Semnalizatorul față dreapta clipește accelerat, iar cel din spate nu se aprinde. Este necesară verificarea becului și a soclului înainte de predare.",
    severity: "high",
    blocking: true,
    state: "open",
  },
  {
    number: 3,
    key: "ulei",
    title: "Pierdere de ulei sub motor",
    description:
      "După staționarea peste noapte au apărut câteva picături de ulei sub motor. Carcasa este umedă în zona garniturii. Trebuie identificată sursa înainte de utilizare.",
    severity: "high",
    blocking: true,
    state: "open",
  },
  {
    number: 4,
    key: "curea",
    title: "Cureaua de transmisie s-a rupt",
    description:
      "Motorul pornește și se turează, dar scuterul nu se mai deplasează. În carcasa transmisiei au fost găsite fragmente de curea. Reparația poate fi simplă, dar scuterul este complet inutilizabil.",
    severity: "critical",
    blocking: true,
    state: "in_progress",
    assigned: true,
    comment:
      "Capacul transmisiei a fost demontat. Verific variatorul și fulia; este necesară o curea nouă înainte de proba de funcționare.",
  },
  {
    number: 7,
    key: "oglinda",
    title: "Oglinda stângă își schimbă poziția în mers",
    description:
      "Oglinda se rotește ușor în articulație și necesită reglaje repetate. Sticla este întreagă, iar suportul nu prezintă fisuri.",
    severity: "moderate",
    blocking: false,
    state: "open",
  },
  {
    number: 9,
    key: "pornire",
    title: "Pornire dificilă la rece",
    description:
      "După o noapte de staționare, motorul pornește abia la a doua sau a treia încercare. După încălzire funcționează normal. Verificarea trebuie făcută înainte de prima pornire a zilei.",
    severity: "moderate",
    blocking: false,
    state: "in_progress",
    assigned: true,
    comment:
      "Am verificat bornele bateriei și filtrul de aer. Următoarea probă se face dimineață, cu motorul rece.",
  },
  {
    number: 12,
    key: "anvelopa",
    title: "Anvelopa spate pierde presiune",
    description:
      "Presiunea a scăzut de la verificarea precedentă, iar în banda de rulare a fost găsit un șurub. Scuterul a fost retras temporar din utilizare.",
    severity: "high",
    blocking: true,
    state: "resolved",
    assigned: true,
    comment:
      "Perforația a fost confirmată. Anvelopa deteriorată a fost înlocuită.",
    resolution:
      "Anvelopa a fost înlocuită; presiunea și etanșeitatea au fost verificate după montaj și după proba de rulare.",
  },
  {
    number: 14,
    key: "semnalizator-fata",
    title: "Semnalizatorul stânga față funcționează intermitent",
    description:
      "Semnalizatorul se aprinde numai în anumite poziții ale ghidonului. Verificarea becului singur nu este suficientă; trebuie controlat și cablajul.",
    severity: "high",
    blocking: true,
    state: "resolved",
    assigned: true,
    retainHold: true,
    comment:
      "Becul a fost înlocuit, dar este necesară verificarea finală a cablajului la bracaj complet.",
    resolution:
      "Becul defect a fost înlocuit. Blocajul pentru mentenanță se păstrează până la verificarea finală a cablajului.",
  },
  {
    number: 14,
    key: "carena",
    title: "Zgârieturi pe carena laterală dreapta",
    description:
      "Carena are zgârieturi superficiale în zona de lângă șa. Nu există fisuri, muchii ascuțite sau elemente desprinse. Se poate programa o remediere cosmetică.",
    severity: "low",
    blocking: false,
    state: "open",
  },
  {
    number: 18,
    key: "claxon",
    title: "Claxonul nu funcționează",
    description:
      "La apăsarea butonului nu se aude niciun sunet. Iluminarea și pornirea funcționează normal. Trebuie verificată siguranța, conexiunea și comanda claxonului.",
    severity: "high",
    blocking: true,
    state: "open",
    assigned: true,
  },
  {
    number: 21,
    key: "sa",
    title: "Încuietoarea șeii se închide greu",
    description:
      "Șaua trebuie apăsată de mai multe ori pentru a se fixa. Cablul de deschidere revine lent. Nu au fost observate probleme la închiderea rezervorului.",
    severity: "moderate",
    blocking: false,
    state: "open",
  },
  {
    number: 27,
    key: "combustibil",
    title: "Indicatorul de combustibil afișează incorect",
    description:
      "Indicatorul arată rezervorul aproape gol imediat după alimentare, apoi revine după câteva minute. Este necesară verificarea plutitorului și a conexiunilor.",
    severity: "moderate",
    blocking: false,
    state: "in_progress",
    assigned: true,
    comment:
      "Conexiunile de la bord sunt curate. Verific senzorul de nivel; cantitatea alimentată a fost notată pentru comparație.",
  },
  {
    number: 35,
    key: "placute",
    title: "Plăcuțele frânei față sunt uzate",
    description:
      "La verificarea vizuală, materialul de fricțiune este aproape de limita de uzură. La frânare se aude un zgomot metalic ușor. Scuterul rămâne blocat până la înlocuire și verificare.",
    severity: "high",
    blocking: true,
    state: "open",
  },
  {
    number: 36,
    key: "vibratii",
    title: "Vibrațiile la accelerare au reapărut",
    description:
      "Vibrațiile apar la plecarea de pe loc și între aproximativ 20 și 30 km/h. Problema a reapărut după intervenția la variator și trebuie verificată din nou.",
    severity: "high",
    blocking: true,
    state: "reopened",
    assigned: true,
    resolution:
      "Rolele variatorului au fost înlocuite, iar prima probă de funcționare a fost normală.",
    comment:
      "După o utilizare suplimentară, vibrațiile au reapărut. Raportul este redeschis și blocajul pentru mentenanță a fost reactivat.",
  },
  {
    number: 37,
    key: "vitezometru",
    title: "Raport de vitezometru nefuncțional",
    description:
      "A fost raportată lipsa afișării vitezei în timpul unei deplasări. Scuterul a fost oprit pentru verificare înainte de a fi utilizat din nou.",
    severity: "high",
    blocking: true,
    state: "cancelled",
    assigned: true,
    comment:
      "La verificare, vitezometrul a afișat corect viteza. Raportul a confundat afișarea vitezei cu kilometrajul; nu a fost confirmată o defecțiune.",
  },
  {
    number: 38,
    key: "suport-telefon",
    title: "Suportul telefonului are joc",
    description:
      "Suportul de pe ghidon se mișcă pe denivelări, deși telefonul rămâne fixat. Trebuie strânsă prinderea sau înlocuit suportul dacă filetul este uzat.",
    severity: "low",
    blocking: false,
    state: "open",
  },
];

const membersInclude = {
  roleMemberships: { include: { role: { include: { permissions: true } } } },
  permissionOverrides: true,
} as const;
function canResolve(
  user: Prisma.UserGetPayload<{ include: typeof membersInclude }>,
) {
  if (user.isSuperAdmin) return true;
  const scopes = enforcePrerequisites(
    resolveScopes(
      user.roleMemberships
        .filter((membership) => !membership.role.archivedAt)
        .flatMap((membership) => membership.role.permissions),
      user.permissionOverrides,
    ),
  );
  return ["problems.read", "problems.update", "problems.resolve"].every((key) =>
    scopes[key as v1.access.PermissionKey]?.some(
      (scope) => scope === "ALL" || scope === "ASSIGNED",
    ),
  );
}

async function seed(tx: Prisma.TransactionClient, dryRun: boolean) {
  await tx.scooterFleetCounter.update({
    where: { id: 1 },
    data: { lastNumber: { increment: 0 } },
  });
  const scooters = await tx.scooter.findMany({
    orderBy: { fleetNumber: "asc" },
  });
  const counter = await tx.scooterFleetCounter.findUniqueOrThrow({
    where: { id: 1 },
  });
  if (
    counter.lastNumber > TARGET ||
    scooters.some(
      (scooter) => scooter.fleetNumber > TARGET || scooter.deletedAt,
    )
  )
    throw new Error(
      "Fleet changed: this seed must not renumber, delete or reactivate existing scooters",
    );
  const brands = await tx.scooterBrand.findMany({
    where: { name: { in: ["IVA", "KYMCO"] } },
  });
  const brandMap = new Map(brands.map((brand) => [brand.name, brand.id]));
  if (!brandMap.has("IVA") || !brandMap.has("KYMCO"))
    throw new Error("Required existing brands are unavailable");
  const users = await tx.user.findMany({
    where: { deletedAt: null, loginStatus: "ACTIVE" },
    include: membersInclude,
    orderBy: [{ isSuperAdmin: "desc" }, { id: "asc" }],
  });
  const reporter = users.find((user) => user.isSuperAdmin);
  const assignees = users.filter(canResolve);
  if (!reporter || !assignees.length)
    throw new Error("No active reporter and eligible assignee available");
  const member = (user: typeof reporter) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
  });
  const byNumber = new Map(
    scooters.map((scooter) => [scooter.fleetNumber, scooter]),
  );
  const original = JSON.stringify(scooters);
  const missing = Array.from(
    { length: TARGET },
    (_, index) => index + 1,
  ).filter((number) => !byNumber.has(number));
  const existingReports = new Set(
    (
      await tx.scooterProblem.findMany({
        where: { id: { startsWith: `${PREFIX}-problem-` } },
        select: { id: true },
      })
    ).map((report) => report.id),
  );
  const reportPlans = reports.map((report) => ({
    ...report,
    id: `${PREFIX}-problem-${String(report.number).padStart(3, "0")}-${report.key}`,
  }));
  const summary = {
    existingScooters: scooters.length,
    newScooters: missing.length,
    newReports: reportPlans.filter((report) => !existingReports.has(report.id))
      .length,
    range: "001–038",
    eligibleAssignees: assignees.map((user) =>
      [user.firstName, user.lastName].filter(Boolean).join(" "),
    ),
  };
  if (dryRun) return summary;

  for (const number of missing) {
    const brand = number % 2 ? "IVA" : "KYMCO";
    const input = v1.scooters.createScooterInputSchema.parse({
      vin: `DEMR0${String(number).padStart(12, "0")}`,
      brandId: brandMap.get(brand),
      model: brand === "IVA" ? "JL50QT-2" : "Agility 50",
      powertrainType: "combustion",
      engineDisplacementCc: 50,
      manufactureYear: 2021 + (number % 5),
      color: ["alb", "negru", "albastru", "roșu", "gri", "argintiu"][
        number % 6
      ],
      currentMileageKm: 1_200 + ((number * 817) % 24_000),
      hasGps: number % 3 === 0,
      odometerWorking: true,
      speedometerWorking: true,
      registrationType: "unregistered",
      requiredLicenseCategory: "AM",
      notes:
        "Date demonstrative pentru testarea flotei și a problemelor. VIN fictiv; documentele și înregistrarea trebuie completate înainte de utilizare reală.",
    });
    const scooter = await tx.scooter.create({
      data: {
        id: `${PREFIX}-scooter-${String(number).padStart(3, "0")}`,
        fleetNumber: number,
        vin: input.vin,
        brandId: input.brandId,
        model: input.model,
        color: input.color,
        powertrainType: input.powertrainType,
        engineDisplacementCc: input.engineDisplacementCc,
        manufactureYear: input.manufactureYear,
        currentMileageKm: input.currentMileageKm,
        hasGps: input.hasGps,
        odometerWorking: input.odometerWorking,
        speedometerWorking: input.speedometerWorking,
        registrationType: input.registrationType,
        requiredLicenseCategory: input.requiredLicenseCategory,
        notes: input.notes,
      },
    });
    byNumber.set(number, scooter);
  }
  // Filling historical gaps does not consume numbers above the requested range.
  if (counter.lastNumber < TARGET)
    await tx.scooterFleetCounter.update({
      where: { id: 1 },
      data: { lastNumber: TARGET },
    });

  for (const [index, plan] of reportPlans.entries()) {
    if (existingReports.has(plan.id)) continue;
    const scooter = byNumber.get(plan.number)!;
    const assignee = plan.assigned ? assignees[index % assignees.length] : null;
    const now = Date.now();
    const createdAt = new Date(
      Math.max(now - (index + 3) * 86_400_000, scooter.createdAt.getTime()),
    );
    // Demo history must fit between inventory creation and now, including new scooters.
    const maxElapsed = 172_920_000;
    const span = Math.min(
      maxElapsed,
      Math.max(0, now - createdAt.getTime() - 1_000),
    );
    const eventAt = (elapsed: number) =>
      new Date(createdAt.getTime() + Math.floor((elapsed / maxElapsed) * span));
    let revision = 1;
    let state = {
      status: "open",
      assigneeId: null as string | null,
      assignee: null as ReturnType<typeof member> | null,
      severity: plan.severity,
      blocksUsage: plan.blocking,
      title: plan.title,
    };
    const history: Prisma.AuditEventCreateManyInput[] = [];
    function event(
      type: string,
      before: typeof state | null,
      after: typeof state | null,
      elapsed: number,
      note?: string,
    ) {
      history.push({
        id: `${plan.id}-event-${history.length + 1}`,
        type,
        userId: reporter!.id,
        targetType: "ScooterProblem",
        targetId: plan.id,
        createdAt: eventAt(elapsed),
        meta: {
          seed: PREFIX,
          ...(before ? { before } : {}),
          ...(after ? { after } : {}),
          ...(note ? { note } : {}),
        },
      });
    }
    event("PROBLEM_CREATED", null, { ...state }, 0);
    if (assignee) {
      const before = { ...state };
      state = { ...state, assigneeId: assignee.id, assignee: member(assignee) };
      revision++;
      event("PROBLEM_ASSIGNED", before, { ...state }, 3_600_000);
    }
    if (plan.state !== "open") {
      const before = { ...state };
      state = { ...state, status: "in_progress" };
      revision++;
      event("PROBLEM_UPDATED", before, { ...state }, 21_600_000);
    }
    if (plan.comment && plan.state !== "reopened") {
      revision++;
      event("PROBLEM_COMMENTED", null, null, 28_800_000, plan.comment);
    }
    let resolvedAt: Date | null = null;
    let holdClearedAt: Date | null = null;
    let resolutionNotes: string | null = null;
    if (plan.state === "resolved" || plan.state === "reopened") {
      const before = { ...state };
      resolvedAt = eventAt(86_400_000);
      resolutionNotes = plan.resolution!;
      state = {
        ...state,
        status: "resolved",
        blocksUsage: !!plan.retainHold && plan.blocking,
      };
      if (plan.blocking && !plan.retainHold) holdClearedAt = resolvedAt;
      revision++;
      event(
        "PROBLEM_RESOLVED",
        before,
        { ...state },
        86_400_000,
        resolutionNotes,
      );
    }
    if (plan.state === "reopened") {
      const before = { ...state };
      state = { ...state, status: "open" };
      resolvedAt = null;
      revision++;
      event("PROBLEM_REOPENED", before, { ...state }, 172_800_000);
      const prior = { ...state };
      state = { ...state, blocksUsage: true };
      holdClearedAt = null;
      revision++;
      event("PROBLEM_HOLD_CHANGED", prior, { ...state }, 172_860_000);
      revision++;
      event("PROBLEM_COMMENTED", null, null, 172_920_000, plan.comment);
    }
    if (plan.state === "cancelled") {
      const before = { ...state };
      state = { ...state, status: "cancelled", blocksUsage: false };
      holdClearedAt = eventAt(86_400_000);
      revision++;
      event(
        "PROBLEM_CANCELLED",
        before,
        { ...state },
        86_400_000,
        "Raport incorect; defecțiunea nu a fost confirmată la verificare.",
      );
    }
    const lastEventAt = history.at(-1)!.createdAt as Date;
    const input = v1.problems.createProblemInputSchema.parse({
      scooterId: scooter.id,
      title: plan.title,
      description: plan.description,
      severity: plan.severity,
      blocksUsage: plan.blocking,
    });
    await tx.scooterProblem.create({
      data: {
        id: plan.id,
        scooterId: scooter.id,
        title: input.title,
        description: input.description,
        severity: input.severity,
        status: state.status,
        blocksUsage: state.blocksUsage,
        reporterId: reporter.id,
        assigneeId: state.assigneeId,
        revision,
        createdAt,
        updatedAt: lastEventAt,
        resolvedAt,
        resolutionNotes,
        holdClearedAt,
        holdClearedById: holdClearedAt ? reporter.id : null,
      },
    });
    await tx.auditEvent.createMany({ data: history });
  }
  const unchanged = await tx.scooter.findMany({
    where: { id: { in: scooters.map((scooter) => scooter.id) } },
    orderBy: { fleetNumber: "asc" },
  });
  if (JSON.stringify(unchanged) !== original)
    throw new Error("Existing scooters unexpectedly changed");
  const final = await tx.scooter.findMany({
    select: { fleetNumber: true },
    orderBy: { fleetNumber: "asc" },
  });
  if (
    final.length !== TARGET ||
    final.some((scooter, index) => scooter.fleetNumber !== index + 1)
  )
    throw new Error("Final fleet range is invalid");
  return summary;
}

async function main() {
  const summary = await prisma.$transaction((tx) => seed(tx, !apply), {
    timeout: 30_000,
  });
  console.log(
    JSON.stringify(
      { mode: apply ? "applied" : "preview", ...summary },
      null,
      2,
    ),
  );
}
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
