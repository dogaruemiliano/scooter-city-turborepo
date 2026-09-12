import { useEffect, useRef, useState } from "react";
import {
  readPersonDraft,
  writePersonDraft,
  type PersonDraft,
} from "./person-draft-store";

export function usePersonDraft(
  owner: string | undefined,
  snapshot: PersonDraft,
) {
  const [pending, setPending] = useState<PersonDraft | null>(null);
  const [ready, setReady] = useState(!owner);
  const [saveFailed, setSaveFailed] = useState(false);
  const completed = useRef(false);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    void readPersonDraft(owner).then((draft) => {
      if (!active) return;
      setPending(draft);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [owner]);

  useEffect(() => {
    if (!owner || !ready || pending || completed.current) return;
    // Choosing citizenship is the first meaningful edit; don't save untouched forms.
    if (snapshot.navigation.history.length === 1) return;
    let active = true;
    void writePersonDraft(owner, snapshot).then(
      () => {
        if (active) setSaveFailed(false);
      },
      () => {
        if (active) setSaveFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [owner, ready, pending, snapshot]);

  function discard() {
    if (owner)
      void writePersonDraft(owner, null).catch(() => setSaveFailed(true));
    setPending(null);
  }

  return {
    pending,
    ready,
    saveFailed,
    resume: () => setPending(null),
    discard,
    complete: () => {
      completed.current = true;
      discard();
    },
  };
}
