import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { tokens } from "@repo/theme";
import { beforeEach, expect, it, vi } from "vitest";
import {
  PageRefreshSurface,
  usePageRefresh,
  useRoutePageRefresh,
} from "./PageRefresh";
import { RemoteState, useRemote } from "./WorkspaceForm";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  router.refresh.mockReset();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

it("settles a server route refresh even when the transition completes immediately", async () => {
  function RouteSource() {
    useRoutePageRefresh();
    return <p>Server data</p>;
  }
  render(surface(<RouteSource />));
  const button = await screen.findByRole("button", {
    name: messages.en.shared.pullToRefresh.refresh,
  });
  fireEvent.click(button);
  await waitFor(() => expect(button).toBeEnabled());
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(button);
  await waitFor(() => expect(button).toBeEnabled());
  expect(router.refresh).toHaveBeenCalledTimes(2);
});

function Source({
  load,
  contributor = false,
  enabled = true,
}: {
  load: () => Promise<string>;
  contributor?: boolean;
  enabled?: boolean;
}) {
  const remote = useRemote(load);
  usePageRefresh(remote.reload, {
    refreshing: remote.loading,
    contributor,
    enabled,
  });
  return (
    <div>
      {remote.data ?? <RemoteState retry={remote.reload} />}
      <p role={remote.error ? "alert" : undefined}>{remote.error}</p>
    </div>
  );
}
function surface(children: React.ReactNode, route = "list") {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <div>
        <PageRefreshSurface key={route}>{children}</PageRefreshSurface>
      </div>
    </NextIntlClientProvider>
  );
}

it("leaves initial loading to the page and refetches existing content without revealing pull-to-refresh", async () => {
  let resolveInitial!: (value: string) => void;
  const initialLoad = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        resolveInitial = resolve;
      }),
  );
  const result = render(surface(<Source load={initialLoad} />));
  const reveal = result.container.querySelector(
    '[data-slot="pull-to-refresh-reveal"]',
  )!;
  expect(screen.getByLabelText(messages.en.workspace.loading)).toBeVisible();
  expect(reveal).toHaveStyle({ height: "0px" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => resolveInitial("Existing data"));

  let resolveRefetch!: (value: string) => void;
  const backgroundLoad = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        resolveRefetch = resolve;
      }),
  );
  result.rerender(surface(<Source load={backgroundLoad} />));
  expect(backgroundLoad).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Existing data")).toBeVisible();
  expect(screen.queryByLabelText(messages.en.workspace.loading)).toBeNull();
  expect(reveal).toHaveStyle({ height: "0px" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: messages.en.shared.pullToRefresh.refresh,
    }),
  ).toBeDisabled();
  await act(async () => resolveRefetch("Updated data"));
  expect(screen.getByText("Updated data")).toBeVisible();
  expect(reveal).toHaveStyle({ height: "0px" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("does not carry an explicit refresh into a restored page's background load after navigation", () => {
  const onRefresh = vi.fn();
  function RestoredSource({ refreshing }: { refreshing: boolean }) {
    usePageRefresh(onRefresh, { refreshing });
    return <p>Restored page data</p>;
  }
  const result = render(surface(<RestoredSource refreshing={false} />));
  fireEvent.click(
    screen.getByRole("button", {
      name: messages.en.shared.pullToRefresh.refresh,
    }),
  );
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent(
    messages.en.shared.pullToRefresh.refreshing,
  );

  result.rerender(surface(<p>Other page</p>, "detail"));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  result.rerender(surface(<RestoredSource refreshing />));
  expect(screen.getByText("Restored page data")).toBeVisible();
  const reveal = result.container.querySelector(
    '[data-slot="pull-to-refresh-reveal"]',
  )!;
  expect(reveal).toHaveStyle({ height: "0px" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  result.rerender(surface(<RestoredSource refreshing={false} />));
  fireEvent.click(
    screen.getByRole("button", {
      name: messages.en.shared.pullToRefresh.refresh,
    }),
  );
  expect(onRefresh).toHaveBeenCalledTimes(2);
  result.rerender(surface(<RestoredSource refreshing />));
  expect(reveal).toHaveStyle({
    height: `${tokens.motion.gesture.pullToRefresh.maxTravel}px`,
  });
  result.rerender(surface(<RestoredSource refreshing={false} />));
  expect(reveal).toHaveStyle({ height: "0px" });
  expect(reveal).toHaveClass("transition-[height]", "duration-slow");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("refreshes all page sources, retains content on failure, and permits recovery", async () => {
  const main = vi
    .fn<() => Promise<string>>()
    .mockResolvedValue("Scooter details");
  const related = vi.fn<() => Promise<string>>().mockResolvedValue("Photos");
  render(
    surface(
      <>
        <Source load={main} />
        <Source load={related} contributor />
      </>,
    ),
  );
  const button = await screen.findByRole("button", {
    name: messages.en.shared.pullToRefresh.refresh,
  });
  await waitFor(() => expect(button).toBeEnabled());
  let reject!: (error: Error) => void;
  let resolveRelated!: (value: string) => void;
  main.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  related.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRelated = resolve;
      }),
  );
  fireEvent.click(button);
  expect(main).toHaveBeenCalledTimes(2);
  expect(related).toHaveBeenCalledTimes(2);
  fireEvent.click(button);
  expect(main).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Scooter details")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    messages.en.shared.pullToRefresh.refreshing,
  );
  await act(async () => reject(new Error("Offline")));
  expect(screen.getByRole("alert")).toHaveTextContent("Offline");
  expect(button).toBeDisabled();
  await act(async () => resolveRelated("New photos"));
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(button);
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(main).toHaveBeenCalledTimes(3);
});

it("contributors and inactive sources cannot enable refresh; navigation clears registrations", async () => {
  const load = vi.fn<() => Promise<string>>().mockResolvedValue("Data");
  const result = render(
    surface(
      <>
        <Source load={load} contributor />
        <Source load={load} enabled={false} />
      </>,
    ),
  );
  await screen.findAllByText("Data");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  result.rerender(surface(<Source load={load} />));
  await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  result.rerender(surface(<p>Edit form</p>, "edit"));
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
