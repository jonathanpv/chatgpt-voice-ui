"use client";

import { assign, createMachine } from "xstate";
import type { OrbState } from "@/app/components/OrbVisualization";
import type { SessionStatus } from "@/app/types";

export type OrbAudioSource = "mic" | "output" | "idle";

type OrbContext = {
  isOrbMode: boolean;
  isVoiceEnabled: boolean;
  isConnected: boolean;
  userSpeaking: boolean;
  assistantThinking: boolean;
  assistantSpeaking: boolean;
  orbState: OrbState;
  audioSource: OrbAudioSource;
  isListening: boolean;
};

export type OrbEvent =
  | { type: "SET_ORB_MODE"; value: boolean }
  | { type: "SET_VOICE_ENABLED"; value: boolean }
  | { type: "SET_CONNECTION_STATUS"; status: SessionStatus }
  | { type: "USER_SPEECH_START" }
  | { type: "USER_SPEECH_STOP" }
  | { type: "ASSISTANT_THINKING_START" }
  | { type: "ASSISTANT_SPEAKING_START" }
  | { type: "ASSISTANT_SPEAKING_STOP" }
  | { type: "ASSISTANT_IDLE" }
  | { type: "RESET_ALL" };

const deriveOrbView = (context: OrbContext) => {
  if (!context.isVoiceEnabled || !context.isConnected) {
    return {
      orbState: context.isOrbMode ? "listen" : "idle",
      audioSource: "idle" as const,
      isListening: context.isOrbMode,
    };
  }

  if (context.assistantSpeaking) {
    return {
      orbState: "speak" as const,
      audioSource: "output" as const,
      isListening: false,
    };
  }

  if (context.assistantThinking) {
    return {
      orbState: "think" as const,
      audioSource: "idle" as const,
      isListening: !context.userSpeaking,
    };
  }

  return {
    orbState: "listen" as const,
    audioSource: context.userSpeaking ? ("mic" as const) : ("idle" as const),
    isListening: !context.userSpeaking,
  };
};

const applyEvent = (context: OrbContext, event: OrbEvent) => {
  switch (event.type) {
    case "SET_ORB_MODE":
      return { isOrbMode: event.value };
    case "SET_VOICE_ENABLED":
      return { isVoiceEnabled: event.value };
    case "SET_CONNECTION_STATUS":
      return { isConnected: event.status === "CONNECTED" };
    case "USER_SPEECH_START":
      return { userSpeaking: true };
    case "USER_SPEECH_STOP":
      return { userSpeaking: false };
    case "ASSISTANT_THINKING_START":
      return { assistantThinking: true };
    case "ASSISTANT_SPEAKING_START":
      return { assistantSpeaking: true, assistantThinking: false };
    case "ASSISTANT_SPEAKING_STOP":
      return { assistantSpeaking: false };
    case "ASSISTANT_IDLE":
      return { assistantThinking: false, assistantSpeaking: false };
    case "RESET_ALL":
      return {
        userSpeaking: false,
        assistantThinking: false,
        assistantSpeaking: false,
      };
    default:
      return {};
  }
};

const baseContext: OrbContext = {
  isOrbMode: false,
  isVoiceEnabled: false,
  isConnected: false,
  userSpeaking: false,
  assistantThinking: false,
  assistantSpeaking: false,
  orbState: "idle",
  audioSource: "idle",
  isListening: false,
};

export const orbMachine = createMachine(
  {
    id: "orb",
    initial: "running",
    context: {
      ...baseContext,
      ...deriveOrbView(baseContext),
    },
    states: {
      running: {
        on: {
          SET_ORB_MODE: { actions: "syncState" },
          SET_VOICE_ENABLED: { actions: "syncState" },
          SET_CONNECTION_STATUS: { actions: "syncState" },
          USER_SPEECH_START: { actions: "syncState" },
          USER_SPEECH_STOP: { actions: "syncState" },
          ASSISTANT_THINKING_START: { actions: "syncState" },
          ASSISTANT_SPEAKING_START: { actions: "syncState" },
          ASSISTANT_SPEAKING_STOP: { actions: "syncState" },
          ASSISTANT_IDLE: { actions: "syncState" },
          RESET_ALL: { actions: "syncState" },
        },
      },
    },
  },
  {
    actions: {
      syncState: assign(({ context, event }) => {
        const next = { ...context, ...applyEvent(context, event as OrbEvent) };
        return { ...next, ...deriveOrbView(next) };
      }),
    },
  }
);
