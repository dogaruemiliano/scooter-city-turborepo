import { render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { v1 } from "@repo/api-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProblemListItem } from "./ProblemListItem";

vi.mock("@/lib/api", () => ({
  webApi: { url: (path: string) => path },
}));

type Member = NonNullable<v1.problems.Problem["assignee"]>;
const alex: Member = {
  id: "alex",
  firstName: "Alex",
  lastName: "Ionescu",
  avatarAssetId: "alex-avatar",
};
const mara: Member = {
  id: "mara",
  firstName: "Mara",
  lastName: "Popescu",
  avatarAssetId: "mara-avatar",
};
const taylor: Member = {
  id: "taylor",
  firstName: "Taylor",
  lastName: "Smith",
};
const problem: v1.problems.Problem = {
  id: "problem",
  scooterId: "scooter",
  scooter: {
    id: "scooter",
    fleetNumber: 7,
    brandCode: "HON",
    brandName: "Honda",
    model: "Vision",
    registrationNumber: null,
  },
  title: "Inspect rear brake",
  description: "",
  difficulty: "hard",
  blocksUsage: false,
  holdClearedAt: null,
  photos: [],
  checklist: [],
  sections: [],
  buyList: [],
  location: null,
  assigneeId: null,
  assignee: null,
  priority: "normal",
  status: "open",
  revision: 1,
  createdAt: "2026-10-14T08:00:00Z",
  updatedAt: "2026-10-14T08:00:00Z",
  resolvedAt: null,
};

function renderCard(record: v1.problems.Problem, simple = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ProblemListItem
        problem={record}
        variant={simple ? "simple" : "default"}
        href={`/en/problems/${record.id}`}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe.each(["issue", "todo", "scooter detail"])(
  "%s card assignees",
  (surface) => {
    const record =
      surface === "todo"
        ? { ...problem, scooterId: null, scooter: null }
        : problem;
    const simple = surface === "scooter detail";

    it.each([
      [alex, mara],
      [alex, mara, taylor],
    ])(
      "shows every avatar without inline names for %j",
      (...assignees: Member[]) => {
        const { container } = renderCard(
          { ...record, assignee: alex, assignees },
          simple,
        );
        const names = assignees.map(
          (member) => `${member.firstName} ${member.lastName}`,
        );
        const group = screen.getByRole("img", { name: names.join(", ") });
        expect(group.querySelectorAll('[data-slot="avatar"]')).toHaveLength(
          assignees.length,
        );
        expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(
          assignees.length,
        );
        for (const [index, initials] of ["AI", "MP", "TS"].entries()) {
          if (index < assignees.length)
            expect(within(group).getByText(initials)).toBeVisible();
        }
        for (const name of names)
          expect(screen.queryByText(name)).not.toBeInTheDocument();
      },
    );

    it("keeps the avatar and name for a single legacy assignee", () => {
      const { container } = renderCard(
        { ...record, assigneeId: alex.id, assignee: alex },
        simple,
      );
      expect(screen.getByText("Alex Ionescu")).toBeVisible();
      expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(
        1,
      );
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("keeps the unassigned placeholder", () => {
      const { container } = renderCard(record, simple);
      expect(
        screen.getByText(messages.en.workspace.problems.unassigned),
      ).toBeVisible();
      expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(
        1,
      );
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });
  },
);

it("loads each assignee's own image instead of repeating the first avatar", async () => {
  vi.stubGlobal(
    "Image",
    class {
      complete = true;
      naturalWidth = 64;
    },
  );
  renderCard({ ...problem, assignees: [alex, mara] });
  const group = screen.getByRole("img", { name: "Alex Ionescu, Mara Popescu" });
  await waitFor(() => expect(group.querySelectorAll("img")).toHaveLength(2));
  expect(
    Array.from(group.querySelectorAll("img"), (img) => img.getAttribute("src")),
  ).toEqual([
    v1.auth.ROUTES.avatarContent("alex-avatar"),
    v1.auth.ROUTES.avatarContent("mara-avatar"),
  ]);
});

it("includes legacy assignees absent from the multiple-assignee response", () => {
  const { container } = renderCard({
    ...problem,
    assignee: alex,
    assignees: [mara, taylor],
  });
  expect(
    screen.getByRole("img", {
      name: "Alex Ionescu, Mara Popescu, Taylor Smith",
    }),
  ).toBeInTheDocument();
  expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(3);
});
