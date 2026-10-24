import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import { ProfileImage } from "@repo/ui/components/profile-image";
import { ProfilePictureEditor } from "./ProfilePictureEditor";

vi.mock("@/lib/api", () => ({
  webApi: { url: (path: string) => `https://api.test${path}` },
}));

it("uses initials in details and an add prompt in edit mode", () => {
  const edit = vi.fn();
  const view = render(<ProfileImage name="Ada Lovelace" />);
  expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveTextContent(
    "AL",
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  view.rerender(
    <ProfileImage
      name="Ada Lovelace"
      onEdit={edit}
      addLabel="Add picture"
      editLabel="Change picture"
    />,
  );
  expect(screen.queryByText("AL")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add picture" }));
  expect(edit).toHaveBeenCalledOnce();
});

it("offers a pencil action for an existing image and respects disabled state", () => {
  const edit = vi.fn();
  const props = {
    name: "Ada Lovelace",
    src: "/portrait.png",
    onEdit: edit,
    addLabel: "Add picture",
    editLabel: "Change picture",
  };
  const view = render(<ProfileImage {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Change picture" }));
  expect(edit).toHaveBeenCalledOnce();
  view.rerender(<ProfileImage {...props} disabled />);
  expect(screen.getByRole("button", { name: "Change picture" })).toBeDisabled();
});

it.each([null, "existing-picture"])(
  "opens the native image picker from the portrait action (%s)",
  (assetId) => {
    const onSave = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ProfilePictureEditor
          name="Ada Lovelace"
          assetId={assetId}
          value={undefined}
          onChange={onSave}
        />
      </NextIntlClientProvider>,
    );
    const input = screen.getByLabelText("Choose a picture") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(
      screen.getByRole("button", {
        name: assetId ? "Change picture" : "Add picture",
      }),
    );
    expect(click).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(onSave).not.toHaveBeenCalled();
  },
);
