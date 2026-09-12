import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PersonWizardStep } from "./WizardProgress";
import { useWizardNavigation } from "./useWizardNavigation";

function setup(steps: PersonWizardStep[] = []) {
  const hook = renderHook(useWizardNavigation);
  act(() => {
    steps.forEach((step) => hook.result.current.navigate(step));
  });
  return hook;
}

describe("person wizard navigation", () => {
  it("starts at citizenship and only offers forward after going back", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({
      step: "citizenship",
      canGoBack: false,
      forwardStep: undefined,
    });

    for (const step of ["documents", "personal", "contact"] as const) {
      act(() => result.current.navigate(step));
      expect(result.current.step).toBe(step);
      expect(result.current.canGoBack).toBe(true);
      expect(result.current.forwardStep).toBeUndefined();
    }

    act(() => result.current.back());
    expect(result.current.step).toBe("personal");
    expect(result.current.forwardStep).toBe("contact");
  });

  it("replays each visited step through repeated back and forward actions", () => {
    const { result } = setup(["documents", "personal", "license"]);

    for (const step of ["personal", "documents", "citizenship"]) {
      act(() => result.current.back());
      expect(result.current.step).toBe(step);
    }
    expect(result.current.canGoBack).toBe(false);

    for (const step of ["documents", "personal", "license"]) {
      expect(result.current.forwardStep).toBe(step);
      act(() => result.current.forward());
      expect(result.current.step).toBe(step);
    }
    expect(result.current.forwardStep).toBeUndefined();
  });

  it("keeps navigation within the start and end of the visited path", () => {
    const { result } = setup();
    act(() => {
      result.current.back();
      result.current.forward();
    });
    expect(result.current.step).toBe("citizenship");

    act(() => {
      result.current.navigate("documents");
      result.current.forward();
      result.current.forward();
      result.current.back();
      result.current.back();
    });
    expect(result.current.step).toBe("citizenship");
    expect(result.current.forwardStep).toBe("documents");
  });

  it("drops the previous nationality path when citizenship is chosen again", () => {
    const { result } = setup(["documents", "personal", "license"]);
    act(() => result.current.select("citizenship"));
    expect(result.current.forwardStep).toBe("documents");

    act(() => result.current.navigate("documents"));
    expect(result.current.forwardStep).toBeUndefined();
    act(() => result.current.back());
    expect(result.current.step).toBe("citizenship");
    expect(result.current.forwardStep).toBe("documents");
    act(() => result.current.forward());
    expect(result.current.forwardStep).toBeUndefined();
  });

  it("keeps inline document selection out of navigation history", () => {
    const { result } = setup(["documents", "personal", "license"]);
    act(() => result.current.select("documents"));
    act(() => result.current.navigate("documents"));
    expect(result.current.forwardStep).toBe("personal");
    act(() => result.current.back());
    expect(result.current.step).toBe("citizenship");
  });

  it("lets the stepper revisit past and future steps without discarding history", () => {
    const { result } = setup(["documents", "personal", "contact", "address"]);
    act(() => result.current.select("documents"));
    expect(result.current.forwardStep).toBe("personal");
    act(() => result.current.select("contact"));
    expect(result.current.step).toBe("contact");
    expect(result.current.forwardStep).toBe("address");
    act(() => result.current.back());
    expect(result.current.step).toBe("personal");
  });

  it("selects the nearest prior occurrence, then the earliest future occurrence", () => {
    const { result } = setup([
      "documents",
      "personal",
      "contact",
      "personal",
      "review",
    ]);
    act(() => result.current.select("personal"));
    expect(result.current.forwardStep).toBe("review");

    act(() => result.current.select("citizenship"));
    act(() => result.current.select("personal"));
    expect(result.current.forwardStep).toBe("contact");
  });

  it("creates a new path when the stepper selects an unvisited step", () => {
    const { result } = setup(["documents", "personal", "contact"]);
    act(() => result.current.back());
    act(() => result.current.select("review"));
    expect(result.current.step).toBe("review");
    expect(result.current.forwardStep).toBeUndefined();
    act(() => result.current.back());
    expect(result.current.step).toBe("personal");
    expect(result.current.forwardStep).toBe("review");
  });

  it("records primary error redirects even when that step was visited before", () => {
    const { result } = setup(["documents", "personal", "contact", "review"]);
    act(() => result.current.navigate("personal"));
    expect(result.current.forwardStep).toBeUndefined();
    act(() => result.current.back());
    expect(result.current.step).toBe("review");
    expect(result.current.forwardStep).toBe("personal");
  });

  it("ignores same-step navigation without losing the available forward step", () => {
    const { result } = setup(["documents", "personal"]);
    act(() => result.current.back());
    act(() => {
      result.current.navigate("documents");
      result.current.select("documents");
    });
    expect(result.current.step).toBe("documents");
    expect(result.current.forwardStep).toBe("personal");
    act(() => result.current.back());
    expect(result.current.step).toBe("citizenship");
  });
});
