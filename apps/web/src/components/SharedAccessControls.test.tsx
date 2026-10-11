import { createRef, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NativeSelect } from "@repo/ui/components/native-select";
import { SearchField } from "@repo/ui/components/search-field";
import { SegmentedRadioGroup } from "@repo/ui/components/segmented-radio-group";
import { ListSearchInput } from "./ListSearchInput";

describe("shared search field", () => {
  it("fits inside a form, forwards its ref, and clears without submitting or losing input focus", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    const ref = createRef<HTMLInputElement>();
    function Harness() {
      const [value, setValue] = useState("Alex");
      return (
        <form
          aria-label="Record filter"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <SearchField
            ref={ref}
            label="Search records"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onClear={() => setValue("")}
            clearLabel="Clear search"
          />
        </form>
      );
    }
    const view = render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Search records" });
    expect(ref.current).toBe(input);
    expect(view.container.querySelectorAll("form")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(submit).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await user.type(input, "Maria{Enter}");
    expect(submit).toHaveBeenCalledOnce();
  });

  it("preserves explicit search submission and clear actions in list screens", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const onClear = vi.fn();
    const onChange = vi.fn();
    const props = {
      id: "list-query",
      label: "Find people",
      placeholder: "Name or email",
      clearLabel: "Clear people search",
      value: "Alex",
      onChange,
      onSearch,
      onClear,
    };
    const view = render(<ListSearchInput {...props} />);
    const input = screen.getByRole("searchbox", { name: "Find people" });
    await user.type(input, "a{Enter}");
    expect(onChange).toHaveBeenCalledWith("Alexa");
    expect(onSearch).toHaveBeenCalledOnce();
    await user.click(
      screen.getByRole("button", { name: "Clear people search" }),
    );
    expect(onClear).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledOnce();
    view.rerender(<ListSearchInput {...props} disabled />);
    expect(input).toBeDisabled();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("shared selection controls", () => {
  it("preserves native select naming, ref, form value, and disabled behavior", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLSelectElement>();
    const onChange = vi.fn();
    const view = render(
      <NativeSelect
        ref={ref}
        aria-label="Visibility"
        name="visibility"
        defaultValue="assigned"
        onChange={onChange}
      >
        <option value="assigned">Assigned</option>
        <option value="all">All records</option>
      </NativeSelect>,
    );
    const select = screen.getByRole("combobox", { name: "Visibility" });
    expect(ref.current).toBe(select);
    await user.selectOptions(select, "all");
    expect(select).toHaveValue("all");
    expect(onChange).toHaveBeenCalledOnce();
    view.rerender(
      <NativeSelect aria-label="Visibility" disabled defaultValue="all">
        <option value="all">All records</option>
      </NativeSelect>,
    );
    expect(select).toBeDisabled();
  });

  it("supports arrow keys, wraps selection, skips disabled choices, and submits exactly one radio value", async () => {
    const user = userEvent.setup();
    function Harness({ disabled = false }: { disabled?: boolean }) {
      const [value, setValue] = useState("inherited");
      return (
        <form aria-label="Preference form">
          <SegmentedRadioGroup
            label="Record access"
            name="record-access"
            value={value}
            onValueChange={setValue}
            disabled={disabled}
            options={[
              { value: "enabled", label: "Enabled", tone: "primary" },
              { value: "inherited", label: "Inherited" },
              { value: "unavailable", label: "Unavailable", disabled: true },
              { value: "denied", label: "Denied", tone: "destructive" },
            ]}
          />
        </form>
      );
    }
    const view = render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "Record access" });
    within(group).getByRole("radio", { name: "Inherited" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(group).getByRole("radio", { name: "Denied" })).toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(within(group).getByRole("radio", { name: "Enabled" })).toBeChecked();
    expect(
      new FormData(screen.getByRole("form") as HTMLFormElement).getAll(
        "record-access",
      ),
    ).toEqual(["enabled"]);
    view.rerender(<Harness disabled />);
    for (const radio of within(group).getAllByRole("radio"))
      expect(radio).toBeDisabled();
    await user.click(within(group).getByRole("radio", { name: "Denied" }));
    expect(within(group).getByRole("radio", { name: "Enabled" })).toBeChecked();
  });
});
