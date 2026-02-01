"use client";

import { assign, createMachine } from "xstate";
import type { OrbState } from "@/app/components/OrbVisualization";
import type { SessionStatus } from "@/app/types";
import { postClientLog } from "@/app/lib/clientLog";

export type AppMode = "chat" | "orb";
export type OrbAudioSource = "mic" | "output" | "idle";

export type AppMachineInput = {
  initialMode?: AppMode;
  initialVoiceEnabled?: boolean;
  initialAudioPlaybackEnabled?: boolean;
  initialSessionStatus?: SessionStatus;
};

type AppContext = {
  mode: AppMode;
  voiceEnabled: boolean;
  audioPlaybackEnabled: boolean;
  sessionStatus: SessionStatus;
  prompt: string;
  userSpeaking: boolean;
  assistantThinking: boolean;
  assistantSpeaking: boolean;
  orbState: OrbState;
  orbAudioSource: OrbAudioSource;
  orbIsListening: boolean;
  orbStateStartTimeMs: number;
};

type DerivedOrbView = {
  orbState: OrbState;
  orbAudioSource: OrbAudioSource;
  orbIsListening: boolean;
  orbReason: string;
};

const ORB_DEBUG_EVENTS = new Set([
  "TOGGLE_MODE",
  "SET_MODE",
  "TOGGLE_VOICE",
  "SET_VOICE_ENABLED",
  "SET_SESSION_STATUS",
  "USER_SPEECH_START",
  "USER_SPEECH_STOP",
  "ASSISTANT_THINKING_START",
  "ASSISTANT_SPEAKING_START",
  "ASSISTANT_SPEAKING_STOP",
  "ASSISTANT_IDLE",
]);

export type AppEvent =
  | { type: "TOGGLE_MODE" }
  | { type: "SET_MODE"; value: AppMode }
  | { type: "TOGGLE_VOICE" }
  | { type: "SET_VOICE_ENABLED"; value: boolean }
  | { type: "SET_AUDIO_PLAYBACK"; value: boolean }
  | { type: "SET_SESSION_STATUS"; status: SessionStatus }
  | { type: "PROMPT_CHANGED"; value: string }
  | { type: "CLEAR_PROMPT" }
  | { type: "USER_SPEECH_START" }
  | { type: "USER_SPEECH_STOP" }
  | { type: "ASSISTANT_THINKING_START" }
  | { type: "ASSISTANT_SPEAKING_START" }
  | { type: "ASSISTANT_SPEAKING_STOP" }
  | { type: "ASSISTANT_IDLE" };

const getNowMs = () => {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
};

const getOrbPhase = (orbState: OrbState) => {
  if (orbState === "listen" || orbState === "speak" || orbState === "think") {
    return "active";
  }
  return orbState;
};

const deriveOrbView = (context: AppContext): DerivedOrbView => {
  const isOrbMode = context.mode === "orb";
  const isConnected = context.sessionStatus === "CONNECTED";

  if (!context.voiceEnabled || !isConnected) {
    return {
      orbState: isOrbMode ? ("listen" as const) : ("idle" as const),
      orbAudioSource: "idle" as const,
      orbIsListening: isOrbMode,
      orbReason: !context.voiceEnabled
        ? "voice_disabled"
        : "session_not_connected",
    };
  }

  if (context.assistantSpeaking) {
    return {
      orbState: "speak" as const,
      orbAudioSource: "output" as const,
      orbIsListening: false,
      orbReason: "assistant_speaking",
    };
  }

  if (context.assistantThinking) {
    return {
      orbState: "think" as const,
      orbAudioSource: "idle" as const,
      orbIsListening: false,
      orbReason: "assistant_thinking",
    };
  }

  return {
    orbState: "listen" as const,
    orbAudioSource: context.userSpeaking ? ("mic" as const) : ("idle" as const),
    orbIsListening: !context.userSpeaking,
    orbReason: context.userSpeaking ? "user_speaking" : "listening",
  };
};

const applyEvent = (context: AppContext, event: AppEvent) => {
  switch (event.type) {
    case "TOGGLE_MODE":
      return { mode: context.mode === "orb" ? "chat" : "orb" };
    case "SET_MODE":
      return { mode: event.value };
    case "TOGGLE_VOICE": {
      const nextVoice = !context.voiceEnabled;
      return {
        voiceEnabled: nextVoice,
        ...(nextVoice
          ? {}
          : {
              userSpeaking: false,
              assistantThinking: false,
              assistantSpeaking: false,
            }),
      };
    }
    case "SET_VOICE_ENABLED":
      return {
        voiceEnabled: event.value,
        ...(event.value
          ? {}
          : {
              userSpeaking: false,
              assistantThinking: false,
              assistantSpeaking: false,
            }),
      };
    case "SET_AUDIO_PLAYBACK":
      return { audioPlaybackEnabled: event.value };
    case "SET_SESSION_STATUS":
      return {
        sessionStatus: event.status,
        ...(event.status === "CONNECTED"
          ? {}
          : {
              userSpeaking: false,
              assistantThinking: false,
              assistantSpeaking: false,
            }),
      };
    case "PROMPT_CHANGED":
      return { prompt: event.value };
    case "CLEAR_PROMPT":
      return { prompt: "" };
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
    default:
      return {};
  }
};

export const createAppMachine = (input: AppMachineInput = {}) => {
  const baseContext: AppContext = {
    mode: input.initialMode ?? "chat",
    voiceEnabled: input.initialVoiceEnabled ?? false,
    audioPlaybackEnabled: input.initialAudioPlaybackEnabled ?? true,
    sessionStatus: input.initialSessionStatus ?? "DISCONNECTED",
    prompt: "",
    userSpeaking: false,
    assistantThinking: false,
    assistantSpeaking: false,
    orbState: "idle",
    orbAudioSource: "idle",
    orbIsListening: false,
    orbStateStartTimeMs: getNowMs(),
  };
  const derived = deriveOrbView(baseContext);

  return createMachine(
    {
      id: "app",
      initial: "running",
      context: { ...baseContext, ...derived },
      states: {
        running: {
          on: {
            TOGGLE_MODE: { actions: "syncState" },
            SET_MODE: { actions: "syncState" },
            TOGGLE_VOICE: { actions: "syncState" },
            SET_VOICE_ENABLED: { actions: "syncState" },
            SET_AUDIO_PLAYBACK: { actions: "syncState" },
            SET_SESSION_STATUS: { actions: "syncState" },
            PROMPT_CHANGED: { actions: "syncState" },
            CLEAR_PROMPT: { actions: "syncState" },
            USER_SPEECH_START: { actions: "syncState" },
            USER_SPEECH_STOP: { actions: "syncState" },
            ASSISTANT_THINKING_START: { actions: "syncState" },
            ASSISTANT_SPEAKING_START: { actions: "syncState" },
            ASSISTANT_SPEAKING_STOP: { actions: "syncState" },
            ASSISTANT_IDLE: { actions: "syncState" },
          },
        },
      },
    },
    {
      actions: {
        syncState: assign(({ context, event }) => {
          const next = {
            ...context,
            ...applyEvent(context, event as AppEvent),
          };
          const { orbReason, ...derivedView } = deriveOrbView(next);
          const prevOrbState = context.orbState;
          const modeActivated =
            context.mode !== "orb" && next.mode === "orb";
          const prevPhase = getOrbPhase(prevOrbState);
          const nextPhase = getOrbPhase(derivedView.orbState);
          const shouldResetStartTime = modeActivated || prevPhase !== nextPhase;
          const nextOrbStateStartTimeMs = shouldResetStartTime
            ? getNowMs()
            : context.orbStateStartTimeMs;
          const eventType =
            typeof (event as { type?: string })?.type === "string"
              ? (event as { type: string }).type
              : "unknown";
          const shouldLog =
            ORB_DEBUG_EVENTS.has(eventType) ||
            shouldResetStartTime ||
            derivedView.orbState !== context.orbState;

          if (shouldLog) {
            const phaseResetReason = modeActivated
              ? "mode_activated"
              : prevPhase !== nextPhase
                ? `phase_change:${prevPhase}->${nextPhase}`
                : "none";
            postClientLog({
              type: "app.machine.orb_sync",
              payload: {
                event: eventType,
                eventPayload: event,
                prev: {
                  mode: context.mode,
                  sessionStatus: context.sessionStatus,
                  voiceEnabled: context.voiceEnabled,
                  userSpeaking: context.userSpeaking,
                  assistantThinking: context.assistantThinking,
                  assistantSpeaking: context.assistantSpeaking,
                  orbState: context.orbState,
                  orbAudioSource: context.orbAudioSource,
                  orbIsListening: context.orbIsListening,
                  orbStateStartTimeMs: context.orbStateStartTimeMs,
                },
                next: {
                  mode: next.mode,
                  sessionStatus: next.sessionStatus,
                  voiceEnabled: next.voiceEnabled,
                  userSpeaking: next.userSpeaking,
                  assistantThinking: next.assistantThinking,
                  assistantSpeaking: next.assistantSpeaking,
                },
                derived: {
                  orbState: derivedView.orbState,
                  orbAudioSource: derivedView.orbAudioSource,
                  orbIsListening: derivedView.orbIsListening,
                  orbReason,
                },
                timing: {
                  prevPhase,
                  nextPhase,
                  shouldResetStartTime,
                  phaseResetReason,
                  nextOrbStateStartTimeMs,
                },
              },
            });
          }

          return {
            ...next,
            ...derivedView,
            orbStateStartTimeMs: nextOrbStateStartTimeMs,
          };
        }),
      },
    }
  );
};
