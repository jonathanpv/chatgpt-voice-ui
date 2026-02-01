"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createActor } from "xstate";
import { createAppMachine, type AppEvent, type AppMachineInput } from "@/app/state/appMachine";

export function useAppMachine(input: AppMachineInput = {}) {
  const inputRef = useRef(input);
  const actorRef = useRef(createActor(createAppMachine(inputRef.current)));
  const [snapshot, setSnapshot] = useState(actorRef.current.getSnapshot());

  useEffect(() => {
    const actor = actorRef.current;
    const subscription = actor.subscribe((next) => setSnapshot(next));
    actor.start();
    return () => {
      subscription.unsubscribe();
      actor.stop();
    };
  }, []);

  const send = useCallback((event: AppEvent) => {
    actorRef.current.send(event);
  }, []);

  return { snapshot, send };
}
