"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useRef,
  FC,
  PropsWithChildren,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { LoggedEvent } from "@/app/types";

type EventContextValue = {
  loggedEvents: LoggedEvent[];
  logClientEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  logServerEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  logHistoryItem: (item: any) => void;
  toggleExpand: (id: number | string) => void;
};

const EventContext = createContext<EventContextValue | undefined>(undefined);
const enableEventLogToFile = process.env.NEXT_PUBLIC_LOG_EVENTS === "true";

export const EventProvider: FC<PropsWithChildren> = ({ children }) => {
  const [loggedEvents, setLoggedEvents] = useState<LoggedEvent[]>([]);
  const postQueueRef = useRef<Promise<void> | null>(null);

  const postLogToServer = useCallback((entry: Record<string, any>) => {
    if (!enableEventLogToFile) return;
    const payload = {
      type: "event_log",
      entry,
    };

    const send = async () => {
      try {
        await fetch("/api/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // Best-effort logging; ignore failures to avoid render loops.
      }
    };

    postQueueRef.current = (postQueueRef.current ?? Promise.resolve()).then(send);
  }, []);

  const addLoggedEvent = useCallback(
    (
      direction: "client" | "server",
      eventName: string,
      eventData: Record<string, any>
    ) => {
      const id = eventData.event_id || uuidv4();
      const entry = {
        id,
        direction,
        eventName,
        eventData,
        timestamp: new Date().toLocaleTimeString(),
        expanded: false,
      };
      setLoggedEvents((prev) => [...prev, entry]);
      postLogToServer(entry);
    },
    [postLogToServer]
  );

  const logClientEvent: EventContextValue["logClientEvent"] = useCallback(
    (eventObj, eventNameSuffix = "") => {
      const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
      addLoggedEvent("client", name, eventObj);
    },
    [addLoggedEvent]
  );

  const logServerEvent: EventContextValue["logServerEvent"] = useCallback(
    (eventObj, eventNameSuffix = "") => {
      const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
      addLoggedEvent("server", name, eventObj);
    },
    [addLoggedEvent]
  );

  const logHistoryItem: EventContextValue["logHistoryItem"] = useCallback(
    (item) => {
      let eventName = item.type;
      if (item.type === "message") {
        eventName = `${item.role}.${item.status}`;
      }
      if (item.type === "function_call") {
        eventName = `function.${item.name}.${item.status}`;
      }
      addLoggedEvent("server", eventName, item);
    },
    [addLoggedEvent]
  );

  const toggleExpand: EventContextValue["toggleExpand"] = useCallback(
    (id) => {
      setLoggedEvents((prev) =>
        prev.map((log) => {
          if (log.id === id) {
            return { ...log, expanded: !log.expanded };
          }
          return log;
        })
      );
    },
    []
  );

  const value = useMemo(
    () => ({
      loggedEvents,
      logClientEvent,
      logServerEvent,
      logHistoryItem,
      toggleExpand,
    }),
    [loggedEvents, logClientEvent, logServerEvent, logHistoryItem, toggleExpand]
  );

  return (
    <EventContext.Provider value={value}>{children}</EventContext.Provider>
  );
};

export function useEvent() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error("useEvent must be used within an EventProvider");
  }
  return context;
}
