import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "./SessionProvider";
import { canAccess } from "@/lib/access";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/problems" }));
const user = {
  id: "mechanic",
  email: "mechanic@example.com",
  roles: [],
  accessRevision: 1,
  effectiveScopes: { "problems.resolve": ["ASSIGNED"] },
};
function Child() {
  const { user } = useSession();
  return (
    <span>
      {canAccess(user, "problems.resolve") ? "May resolve" : "Cannot resolve"}
    </span>
  );
}
beforeEach(() => mocks.fetch.mockResolvedValue(user));
describe("fresh client capabilities", () => {
  it("refreshes shared-role authority on focus even with the same user revision", async () => {
    render(
      <SessionProvider initialUser={user}>
        <Child />
      </SessionProvider>,
    );
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    mocks.fetch.mockResolvedValue({ ...user, effectiveScopes: {} });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByText("Cannot resolve")).toBeInTheDocument();
  });
});
