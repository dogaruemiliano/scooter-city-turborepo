import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UserAvatar } from "@repo/ui/components/user-avatar";
import { PersonRow } from "@repo/ui/components/person-row";
import { CommentItem } from "@repo/ui/components/comments";

afterEach(() => vi.unstubAllGlobals());

it("shows initials when no image is attached", () => {
  render(<UserAvatar name="Ada Lovelace" />);
  expect(screen.getByText("AL")).toBeVisible();
});

it("shows the image instead of initials after it loads", async () => {
  vi.stubGlobal(
    "Image",
    class {
      complete = true;
      naturalWidth = 64;
    },
  );
  const { container } = render(
    <UserAvatar name="Ada Lovelace" src="/avatar.png" />,
  );
  await waitFor(() =>
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/avatar.png",
    ),
  );
  expect(screen.queryByText("AL")).not.toBeInTheDocument();
});

it("falls back to initials when an image fails, then loads its replacement", async () => {
  vi.stubGlobal(
    "Image",
    class {
      complete = true;
      naturalWidth = 0;
    },
  );
  const view = render(<UserAvatar name="Ada Lovelace" src="/missing.png" />);
  await waitFor(() => expect(screen.getByText("AL")).toBeVisible());
  vi.stubGlobal(
    "Image",
    class {
      complete = true;
      naturalWidth = 64;
    },
  );
  view.rerender(<UserAvatar name="Ada Lovelace" src="/replacement.png" />);
  await waitFor(() =>
    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      "/replacement.png",
    ),
  );
  expect(screen.queryByText("AL")).not.toBeInTheDocument();
});

it("supports the same image fallback on person rows and comment authors", async () => {
  vi.stubGlobal(
    "Image",
    class {
      complete = true;
      naturalWidth = 64;
    },
  );
  const view = render(
    <>
      <PersonRow name="Ada Lovelace" avatarUrl="/person.png" />
      <ul>
        <CommentItem
          author="Alex Morgan"
          avatarUrl="/comment.png"
          dateTime="2026-10-24"
          timestamp="Today"
        >
          Hello
        </CommentItem>
      </ul>
    </>,
  );
  await waitFor(() =>
    expect(view.container.querySelectorAll("img")).toHaveLength(2),
  );
  expect(
    view.container.querySelector('img[src="/person.png"]'),
  ).toBeInTheDocument();
  expect(
    view.container.querySelector('img[src="/comment.png"]'),
  ).toBeInTheDocument();
  expect(screen.queryByText("AM")).not.toBeInTheDocument();
});
