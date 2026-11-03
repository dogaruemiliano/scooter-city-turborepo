import { useCallback, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { v1 } from "@repo/api-shared";
import Link from "next/link";

import { useScootersListScroll } from "./useScootersListScroll";

const initialList: v1.scooters.ScooterList = {
  items: [],
  page: 1,
  pageSize: 25,
  total: 75,
};
const initialQuery: v1.scooters.ListScootersQuery = {
  page: 1,
  pageSize: 25,
  includeDeleted: false,
};
let frames: Map<number, FrameRequestCallback>;

function List({ mobile = false }: { mobile?: boolean }) {
  const [list, setList] = useState(initialList);
  const [query, setQuery] = useState(initialQuery);
  const restore = useCallback(
    (
      savedList: v1.scooters.ScooterList,
      savedQuery: v1.scooters.ListScootersQuery,
    ) => {
      setList(savedList);
      setQuery(savedQuery);
    },
    [],
  );
  const { pageRef, onClickCapture } = useScootersListScroll(
    list,
    query,
    restore,
  );
  return (
    <div
      data-slot="app-page-scroll"
      data-testid="shell"
      style={{ overflowY: mobile ? "auto" : "visible" }}
    >
      <main ref={pageRef} onClickCapture={onClickCapture}>
        <span>
          Page {list.page}, query {query.page}
        </span>
        <button
          onClick={() => {
            setList({ ...initialList, page: 3 });
            setQuery({ ...initialQuery, page: 3 });
          }}
        >
          Load pages
        </button>
        <Link
          href="/en/scooters/one"
          onClick={(event) => event.preventDefault()}
        >
          Details
        </Link>
      </main>
    </div>
  );
}

beforeEach(() => {
  window.history.replaceState({ router: "preserved" }, "", "/en/scooters");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "scrollY", "get").mockReturnValue(640);
  frames = new Map();
  let id = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) => {
    frames.delete(frame);
  });
});

afterEach(() => vi.restoreAllMocks());

function flushFrames() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}

describe("scooter list return position", () => {
  it.each([false, true])(
    "restores the loaded pages before scrolling (mobile: %s)",
    (mobile) => {
      const firstVisit = render(<List mobile={mobile} />);
      fireEvent.click(screen.getByText("Load pages"));
      screen.getByTestId("shell").scrollTop = 480;
      fireEvent.click(screen.getByText("Details"));
      const listEntry = window.history.state;
      expect(listEntry.router).toBe("preserved");

      window.history.pushState({}, "", "/en/scooters/one");
      firstVisit.unmount();
      window.history.replaceState(listEntry, "", "/en/scooters");
      render(<List mobile={mobile} />);

      expect(screen.getByText("Page 3, query 3")).toBeVisible();
      expect(window.scrollTo).not.toHaveBeenCalled();
      flushFrames();
      if (mobile) {
        expect(screen.getByTestId("shell").scrollTop).toBe(480);
        expect(window.scrollTo).not.toHaveBeenCalled();
      } else {
        expect(window.scrollTo).toHaveBeenCalledWith({
          top: 640,
          behavior: "instant",
        });
      }
    },
  );

  it("does not restore another filter URL's position or rows", () => {
    const firstVisit = render(<List />);
    fireEvent.click(screen.getByText("Load pages"));
    fireEvent.click(screen.getByText("Details"));
    const listEntry = window.history.state;
    firstVisit.unmount();
    window.history.replaceState(listEntry, "", "/en/scooters?search=honda");
    render(<List />);
    flushFrames();
    expect(screen.getByText("Page 1, query 1")).toBeVisible();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("leaves fresh visits at their normal position", () => {
    render(<List />);
    flushFrames();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("does not save return state when opening details in another tab", () => {
    render(<List />);
    fireEvent.click(screen.getByText("Details"), { ctrlKey: true });
    expect(window.history.state).toEqual({ router: "preserved" });
  });

  it("cancels pending restoration when leaving the list", () => {
    const firstVisit = render(<List />);
    fireEvent.click(screen.getByText("Details"));
    firstVisit.unmount();
    const returnVisit = render(<List />);
    returnVisit.unmount();
    flushFrames();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
