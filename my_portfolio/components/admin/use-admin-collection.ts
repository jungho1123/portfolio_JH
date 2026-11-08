import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/admin-api";
import { errorMessage } from "@/lib/error-message";

type Activation = { active: boolean; request: number };

// Initial loads and mutation-triggered reloads share one request generation.
async function loadCollection<T>(
  url: string,
  scope: Activation,
  receive: (items: T[]) => void,
  fail: (message: string) => void,
  finish: () => void,
) {
  const request = ++scope.request;
  const ownsRequest = () => scope.active && request === scope.request;
  try {
    const items = await api<T[]>(url);
    if (ownsRequest()) {
      receive(items);
      fail("");
    }
  } catch (error) {
    if (ownsRequest()) {
      fail(errorMessage(error));
      throw error;
    }
  } finally {
    if (ownsRequest()) finish();
  }
}
export function useAdminCollection<T>(url: string) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const session = useRef<Activation>({ active: false, request: 0 });
  useEffect(() => {
    const scope = { active: true, request: 0 };
    session.current = scope;
    void loadCollection<T>(url, scope, setItems, setError, () =>
      setLoading(false),
    ).catch(() => {});
    return () => {
      scope.active = false;
    };
  }, [url]);
  async function reload() {
    const scope = session.current;
    if (scope.active)
      await loadCollection<T>(url, scope, setItems, setError, () =>
        setLoading(false),
      );
  }
  return { items, error, loading, setError, reload, session };
}
