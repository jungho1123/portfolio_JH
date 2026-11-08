import { useCallback, useEffect, useRef, useState } from "react";
import {
  readRecovery,
  writeRecovery,
  removeRecovery,
  recoveryKey,
  type Recovery,
} from "@/lib/recovery";
import type { HomeData, PostData } from "@/lib/schemas";

type Data = HomeData | PostData;
type EditorRecovery = {
  candidate: Recovery | null;
  persist: (data: Data, revision: number) => void;
  clear: () => Promise<void>;
  consume: (candidate: Recovery) => void;
  dismiss: () => void;
};

// Storage never owns the editable data or server revision.
export function useEditorRecovery(
  accountId: string,
  contentId: string,
  serverData: unknown,
  onError: (message: string) => void,
): EditorRecovery {
  const [candidate, setCandidate] = useState<Recovery | null>(null);
  const session = useRef({ active: false });
  const operations = useRef<Promise<void>>(Promise.resolve());
  const edits = useRef(0);
  useEffect(() => {
    const scope = { active: true };
    session.current = scope;
    return () => {
      scope.active = false;
    };
  }, [accountId, contentId]);
  useEffect(() => {
    let active = true;
    const generation = edits.current;
    void readRecovery(accountId, contentId, serverData)
      .then((value) => {
        if (active && generation === edits.current && value)
          setCandidate(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [accountId, contentId, serverData]);
  const enqueue = useCallback(
    (operation: (isActive: () => boolean) => Promise<void>) => {
      const scope = session.current;
      const task = operations.current.then(() => {
        if (scope.active) return operation(() => scope.active);
      });
      operations.current = task.catch(() => {});
      return task;
    },
    [],
  );
  const persist = useCallback(
    (data: Data, revision: number) => {
      edits.current++;
      const scope = session.current;
      const value: Recovery<Data> = {
        key: recoveryKey(accountId, contentId),
        accountId,
        contentId,
        baseRevision: revision,
        data,
        updatedAt: new Date().toISOString(),
      };
      void enqueue((isActive) => writeRecovery(value, isActive)).catch(() => {
        if (scope.active)
          onError(
            "기기 임시복구를 사용할 수 없습니다. 서버 저장 상태를 확인하세요.",
          );
      });
    },
    [accountId, contentId, enqueue, onError],
  );
  const clear = useCallback(
    () =>
      enqueue((isActive) =>
        removeRecovery(accountId, contentId, undefined, isActive),
      ),
    [accountId, contentId, enqueue],
  );
  const consume = useCallback(
    (value: Recovery) => {
      setCandidate(null);
      if (value.key !== recoveryKey(accountId, contentId))
        void enqueue((isActive) =>
          removeRecovery(accountId, contentId, value.key, isActive),
        ).catch(() => {});
    },
    [accountId, contentId, enqueue],
  );
  const dismiss = () => {
    if (candidate)
      void enqueue((isActive) =>
        removeRecovery(accountId, contentId, candidate.key, isActive),
      ).catch(() => {});
    setCandidate(null);
  };
  return { candidate, persist, clear, consume, dismiss };
}
