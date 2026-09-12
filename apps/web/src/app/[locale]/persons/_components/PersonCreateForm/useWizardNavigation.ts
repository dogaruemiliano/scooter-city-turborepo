import { useCallback, useState } from "react";
import type { PersonWizardStep } from "./WizardProgress";

export type NavigationState = {
  history: PersonWizardStep[];
  cursor: number;
};

function appendStep(state: NavigationState, step: PersonWizardStep) {
  const history = [...state.history.slice(0, state.cursor + 1), step];
  return { history, cursor: history.length - 1 };
}

export function useWizardNavigation() {
  const [state, setState] = useState<NavigationState>({
    history: ["citizenship"],
    cursor: 0,
  });

  const navigate = useCallback((step: PersonWizardStep) => {
    setState((current) => {
      if (current.history[current.cursor] === step) return current;
      // A primary action commits a new path, including citizenship/ID choices.
      return appendStep(current, step);
    });
  }, []);

  const select = useCallback((step: PersonWizardStep) => {
    setState((current) => {
      if (current.history[current.cursor] === step) return current;

      const past = current.history.slice(0, current.cursor).lastIndexOf(step);
      if (past !== -1) return { ...current, cursor: past };

      const future = current.history.indexOf(step, current.cursor + 1);
      if (future !== -1) return { ...current, cursor: future };

      return appendStep(current, step);
    });
  }, []);

  const back = useCallback(() => {
    setState((current) =>
      current.cursor > 0 ? { ...current, cursor: current.cursor - 1 } : current,
    );
  }, []);

  const forward = useCallback(() => {
    setState((current) =>
      current.cursor < current.history.length - 1
        ? { ...current, cursor: current.cursor + 1 }
        : current,
    );
  }, []);

  const restore = useCallback(
    (snapshot: NavigationState) => setState(snapshot),
    [],
  );

  return {
    snapshot: state,
    restore,
    step: state.history[state.cursor]!,
    canGoBack: state.cursor > 0,
    forwardStep: state.history[state.cursor + 1],
    navigate,
    select,
    back,
    forward,
  };
}
