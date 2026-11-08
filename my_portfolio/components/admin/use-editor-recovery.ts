import { useLayoutEffect, useEffectEvent, useRef, useState } from "react";
import {
  readRecovery,
  writeRecovery,
  removeRecovery,
  recoveryKey,
  type Recovery,
} from "@/lib/recovery";
import type { HomeData, PostData } from "@/lib/schemas";

type Data = HomeData | PostData;

// Storage owns candidates and operation ordering, never editable document data.
export function useEditorRecovery(
  accountId: string,
  contentId: string,
  serverData: unknown,
  onError: (message: string) => void,
) {
  const [candidate, setCandidate] = useState<Recovery | null>(null);
  const session = useRef({ active: false });
  const operations = useRef<Promise<void>>(Promise.resolve());
  const edits = useRef(0);
  const readServerData = useEffectEvent(() => serverData);
  useLayoutEffect(() => {
    const scope = { active: true };
    session.current = scope;
    const generation = edits.current;
    // Activity already retains local input. Only a fresh instance needs a candidate.
    if (generation === 0)
      void readRecovery(accountId, contentId, readServerData())
        .then((value) => {
          if (scope.active && generation === edits.current)
            setCandidate(value ?? null);
        })
        .catch(() => {});
    return () => {
      scope.active = false;
    };
  }, [accountId, contentId]);

  function enqueue(operation: (isActive: () => boolean) => Promise<void>) {
    const scope = session.current;
    const task = operations.current.then(() => {
      if (scope.active) return operation(() => scope.active);
    });
    operations.current = task.catch(() => {});
    return task;
  }
  function persist(data: Data, revision: number, generation: number) {
    edits.current = generation;
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
  }
  function clear(generation: number) {
    return enqueue((isActive) =>
      removeRecovery(
        accountId,
        contentId,
        undefined,
        () => isActive() && edits.current <= generation,
      ),
    );
  }
  function consume(value: Recovery) {
    setCandidate(null);
    if (value.key !== recoveryKey(accountId, contentId))
      void enqueue((isActive) =>
        removeRecovery(accountId, contentId, value.key, isActive),
      ).catch(() => {});
  }
  function dismiss() {
    if (candidate)
      void enqueue((isActive) =>
        removeRecovery(accountId, contentId, candidate.key, isActive),
      ).catch(() => {});
    setCandidate(null);
  }
  return { candidate, persist, clear, consume, dismiss };
}
