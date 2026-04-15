import { useEffect, useRef, useState } from "react";

export function useSseSnapshot<T>(url: string | null, initialSnapshot: T) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [connected, setConnected] = useState(false);
  const retryDelayRef = useRef(1000);
  const latestInitialRef = useRef(initialSnapshot);
  latestInitialRef.current = initialSnapshot;

  useEffect(() => {
    if (!url) {
      return;
    }
    setSnapshot(latestInitialRef.current);

    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;

    const cleanup = () => {
      if (source) {
        source.close();
        source = null;
      }
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (closed) {
        return;
      }

      cleanup();
      source = new EventSource(url);

      source.addEventListener("open", () => {
        if (closed) {
          return;
        }
        setConnected(true);
        retryDelayRef.current = 1000;
      });

      source.addEventListener("snapshot", (event) => {
        if (closed) {
          return;
        }
        const message = event as MessageEvent<string>;
        setSnapshot(JSON.parse(message.data) as T);
      });

      source.onerror = () => {
        if (closed) {
          return;
        }

        setConnected(false);
        cleanup();

        const delay = retryDelayRef.current;
        reconnectTimer = window.setTimeout(connect, delay);
        retryDelayRef.current = Math.min(delay * 2, 5000);
      };
    };

    connect();

    return () => {
      closed = true;
      setConnected(false);
      cleanup();
    };
  }, [url]);

  return { snapshot, connected };
}
