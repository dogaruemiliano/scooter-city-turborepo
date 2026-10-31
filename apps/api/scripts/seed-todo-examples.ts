/** Local-only sample tasks. Stable IDs make reruns safe without replacing edits. */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (
    !connectionString ||
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(connectionString).hostname,
    )
  )
    throw new Error("Todo examples require the local development database.");

  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }),
  });
  try {
    const admin = await db.user.findFirst({
      where: {
        deletedAt: null,
        loginStatus: "ACTIVE",
        OR: [
          { isSuperAdmin: true },
          {
            roleMemberships: {
              some: { role: { slug: "admin", archivedAt: null } },
            },
          },
        ],
      },
      orderBy: [{ isSuperAdmin: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!admin)
      throw new Error("An active admin is required for sample todos.");

    const examples = [
      {
        key: "workshop-supplies",
        title: "Demo · Comandă consumabile pentru atelier",
        description:
          "Verifică stocul și pregătește o comandă pentru săptămâna viitoare.",
        status: "open",
        checklist: [
          { id: "stock", text: "Verifică stocul din atelier", completed: true },
          {
            id: "order",
            text: "Trimite comanda către furnizor",
            completed: false,
          },
        ],
      },
      {
        key: "accounting",
        title: "Demo · Pregătește documentele pentru contabilitate",
        description:
          "Centralizează facturile și bonurile, apoi verifică documentele lipsă înainte de predare.",
        status: "in_progress",
        checklist: [],
      },
      {
        key: "team-schedule",
        title: "Demo · Actualizează programul echipei",
        description:
          "Confirmă disponibilitatea colegilor și publică programul pentru săptămâna viitoare.",
        status: "open",
        checklist: [],
      },
      {
        key: "safety-equipment",
        title: "Demo · Verifică stocul de căști și veste",
        description:
          "Inventariază echipamentul disponibil și notează ce trebuie înlocuit.",
        status: "in_progress",
        checklist: [
          { id: "helmets", text: "Verifică starea căștilor", completed: true },
          { id: "vests", text: "Numără vestele disponibile", completed: false },
          {
            id: "replace",
            text: "Notează echipamentul de înlocuit",
            completed: false,
          },
        ],
      },
      {
        key: "supplier-documents",
        title: "Demo · Organizează documentele furnizorilor",
        description:
          "Grupează contractele și datele de contact ale furnizorilor într-un singur loc.",
        status: "resolved",
        checklist: [],
      },
    ];
    let created = 0;
    for (const example of examples) {
      const id = `demo-todo-${example.key}`;
      const inserted = await db.$transaction(async (tx) => {
        if (await tx.scooterProblem.findUnique({ where: { id } })) return false;
        const assigned = example.status !== "open";
        const resolved = example.status === "resolved";
        const todo = await tx.scooterProblem.create({
          data: {
            id,
            scooterId: null,
            difficulty: null,
            title: example.title,
            description: example.description,
            status: example.status,
            reporterId: admin.id,
            assigneeId: assigned ? admin.id : null,
            ...(assigned ? { assignees: { connect: [{ id: admin.id }] } } : {}),
            sections: example.checklist.length ? ["checklist"] : [],
            checklist: example.checklist,
            resolutionNotes: resolved
              ? "Documentele au fost organizate și verificate."
              : null,
            resolvedAt: resolved ? new Date() : null,
          },
        });
        await tx.auditEvent.create({
          data: {
            userId: admin.id,
            type: "PROBLEM_CREATED",
            targetType: "ScooterProblem",
            targetId: todo.id,
            meta: {
              demo: true,
              after: { title: todo.title, status: todo.status },
            },
          },
        });
        return true;
      });
      if (inserted) created += 1;
    }
    const todos = await db.scooterProblem.findMany({
      where: { id: { in: examples.map((item) => `demo-todo-${item.key}`) } },
      select: { title: true, status: true, difficulty: true },
      orderBy: { createdAt: "asc" },
    });
    console.log(JSON.stringify({ created, todos }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
