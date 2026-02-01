"use client";

type ClientLogEntry = {
  type: string;
  payload?: Record<string, any>;
};

let postQueue: Promise<void> = Promise.resolve();

export function postClientLog(entry: ClientLogEntry) {
  if (typeof window === "undefined") return;

  postQueue = postQueue.then(async () => {
    try {
      await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "client_log",
          entry,
        }),
      });
    } catch {
      // Best-effort logging only.
    }
  });
}
