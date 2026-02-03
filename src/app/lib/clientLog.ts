"use client";

type ClientLogEntry = {
  type: string;
  payload?: Record<string, any>;
};

export function postClientLog(entry: ClientLogEntry) {
  void entry;
  // Logging disabled per user request
}