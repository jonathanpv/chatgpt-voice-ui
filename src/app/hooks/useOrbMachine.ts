"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createActor } from "xstate";
import { orbMachine, type OrbEvent } from "@/app/state/orbMachine";
import type { SessionStatus } from "@/app/types";

type UseOrbMachineOptions = {
  isOrbMode: boolean;
  isVoiceEnabled: boolean;
  sessionStatus: SessionStatus;
};

export function useOrbMachine({
  isOrbMode,
  isVoiceEnabled,
  sessionStatus,
}: UseOrbMachineOptions) {
  const actorRef = useRef(createActor(orbMachine));
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

  useEffect(() => {
    actorRef.current.send({ type: "SET_ORB_MODE", value: isOrbMode });
  }, [isOrbMode]);

  useEffect(() => {
    actorRef.current.send({ type: "SET_VOICE_ENABLED", value: isVoiceEnabled });
    if (!isVoiceEnabled) {
      actorRef.current.send({ type: "RESET_ALL" });
    }
  }, [isVoiceEnabled]);

  useEffect(() => {
    actorRef.current.send({
      type: "SET_CONNECTION_STATUS",
      status: sessionStatus,
    });
    if (sessionStatus !== "CONNECTED") {
      actorRef.current.send({ type: "RESET_ALL" });
    }
  }, [sessionStatus]);

  const send = useCallback((event: OrbEvent) => {
    actorRef.current.send(event);
  }, []);

  return {
    orbState: snapshot.context.orbState,
    orbAudioSource: snapshot.context.audioSource,
    orbIsListening: snapshot.context.isListening,
    sendOrbEvent: send,
  };
}
