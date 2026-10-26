import { Odometer } from "@repo/ui/components/odometer";
import { RegistrationPlate } from "@repo/ui/components/registration-plate";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("registration plate", () => {
  it.each(["B 123 ABC", "B-123-ABC", "B - 123   ABC"])(
    "stacks the first two groups and suffix: %s",
    (number) => {
      const { container } = render(
        <RegistrationPlate
          number={number}
          variant="national"
          readingLabel={`National plate: ${number}`}
        />,
      );
      expect(
        screen.getByRole("img", {
          name: `National plate: ${number.replace(/\s+/g, " ")}`,
        }),
      ).toHaveClass("bg-plate");
      expect(
        container.querySelector('[data-slot="registration-plate-top"]'),
      ).toHaveTextContent("B 123");
      expect(
        container.querySelector('[data-slot="registration-plate-bottom"]'),
      ).toHaveTextContent("ABC");
      expect(screen.getByText("RO")).toBeInTheDocument();
    },
  );

  it("keeps local plates yellow without a country strip and preserves leading zeroes", () => {
    render(
      <RegistrationPlate
        number="GJ-11-0134"
        variant="local"
        readingLabel="Local plate: GJ-11-0134"
      />,
    );
    expect(screen.getByRole("img")).toHaveClass("bg-plate-local");
    expect(screen.getByText("GJ 11")).toBeInTheDocument();
    expect(screen.getByText("0134")).toBeInTheDocument();
    expect(screen.queryByText("RO")).not.toBeInTheDocument();
  });

  it("gives temporary plates red lettering, a white surface and a country strip", () => {
    render(
      <RegistrationPlate
        number="B 012345"
        variant="temporary"
        readingLabel="Temporary plate: B 012345"
      />,
    );
    expect(screen.getByRole("img")).toHaveClass(
      "bg-plate",
      "text-plate-temporary",
    );
    expect(screen.getByText("B 012345")).toBeInTheDocument();
    expect(screen.getByText("RO")).toBeInTheDocument();
  });

  it.each(["CJ-0012", "TÂRGU MUREȘ 0012", "COMUNA VALEA MARE 0012", "B123ABC"])(
    "retains every part of legacy data: %s",
    (number) => {
      const { container } = render(
        <RegistrationPlate
          number={number}
          variant="local"
          readingLabel={number}
        />,
      );
      const rows = container.querySelectorAll(
        '[data-slot^="registration-plate-"]',
      );
      expect(
        Array.from(rows, (row) => row.textContent)
          .join(" ")
          .replace(/\s+/g, " "),
      ).toBe(number.replace(/-/g, " "));
    },
  );

  it("does not invent a plate when a number is missing", () => {
    render(
      <RegistrationPlate
        number=" "
        variant="local"
        readingLabel="Missing plate"
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("odometer", () => {
  it.each([0, 7, 450, 12450, 1234567])(
    "shows only the actual digits of %i",
    (value) => {
      render(<Odometer value={value} readingLabel={`${value} km`} />);
      expect(screen.getByRole("img", { name: `${value} km` }).textContent).toBe(
        `${value}km`,
      );
    },
  );

  it("distinguishes missing mileage from a recorded zero", () => {
    render(<Odometer value={null} readingLabel="Mileage not recorded" />);
    expect(screen.getByRole("img").textContent).toBe("—km");
  });
});
