"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";

import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/prompt-kit/chat-container";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/prompt-kit/message";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ToolModal } from "@/components/ui/tool-modal";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useOrbAudioMetrics } from "@/app/hooks/useOrbAudioMetrics";
import { useAppMachine } from "@/app/hooks/useAppMachine";
import { postClientLog } from "@/app/lib/clientLog";
import {
  ArrowUp,
  Copy,
  Globe,
  Mic,
  MoreHorizontal,
  Pencil,
  Plus,
  PlusIcon,
  Search,
  ThumbsDown,
  ThumbsUp,
  Trash,
} from "lucide-react";
import {
  addTodoItem,
  getTodoItems,
  toggleTodoItem,
  type TodoItem,
} from "@/app/lib/todoStore";

// Types
import { SessionStatus } from "@/app/types";
import type { RealtimeAgent } from "@openai/agents/realtime";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useRealtimeSession } from "@/app/hooks/useRealtimeSession";
import { createModerationGuardrail } from "@/app/agentConfigs/guardrails";

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";
import { chatSupervisorScenario } from "@/app/agentConfigs/chatSupervisor";
import { chatSupervisorCompanyName } from "@/app/agentConfigs/chatSupervisor";

// Map used by connect logic for scenarios defined via the SDK.
const sdkScenarioMap: Record<string, RealtimeAgent[]> = {
  chatSupervisor: chatSupervisorScenario,
};

const CONNECT_RETRY_MS = 5000;
const ASSISTANT_SPEAKING_SILENCE_MS = 1200;

const OrbVisualizationClient = dynamic(
  () =>
    import("@/app/components/OrbVisualization").then(
      (mod) => mod.OrbVisualization
    ),
  {
    ssr: false,
    loading: () => <div className="h-full w-full" />,
  }
);

// Initial conversation history
const conversationHistory = [
  {
    period: "Today",
    conversations: [
      {
        id: "t1",
        title: "Project roadmap discussion",
        lastMessage:
          "Let's prioritize the authentication features for the next sprint.",
        timestamp: new Date().setHours(new Date().getHours() - 2),
      },
      {
        id: "t2",
        title: "API Documentation Review",
        lastMessage:
          "The endpoint descriptions need more detail about rate limiting.",
        timestamp: new Date().setHours(new Date().getHours() - 5),
      },
      {
        id: "t3",
        title: "Frontend Bug Analysis",
        lastMessage:
          "I found the issue - we need to handle the null state in the user profile component.",
        timestamp: new Date().setHours(new Date().getHours() - 8),
      },
    ],
  },
  {
    period: "Yesterday",
    conversations: [
      {
        id: "y1",
        title: "Database Schema Design",
        lastMessage:
          "Let's add indexes to improve query performance on these tables.",
        timestamp: new Date().setDate(new Date().getDate() - 1),
      },
      {
        id: "y2",
        title: "Performance Optimization",
        lastMessage:
          "The lazy loading implementation reduced initial load time by 40%.",
        timestamp: new Date().setDate(new Date().getDate() - 1),
      },
    ],
  },
  {
    period: "Last 7 days",
    conversations: [
      {
        id: "w1",
        title: "Authentication Flow",
        lastMessage: "We should implement the OAuth2 flow with refresh tokens.",
        timestamp: new Date().setDate(new Date().getDate() - 3),
      },
      {
        id: "w2",
        title: "Component Library",
        lastMessage:
          "These new UI components follow the design system guidelines perfectly.",
        timestamp: new Date().setDate(new Date().getDate() - 5),
      },
      {
        id: "w3",
        title: "UI/UX Feedback",
        lastMessage:
          "The navigation redesign received positive feedback from the test group.",
        timestamp: new Date().setDate(new Date().getDate() - 6),
      },
    ],
  },
  {
    period: "Last month",
    conversations: [
      {
        id: "m1",
        title: "Initial Project Setup",
        lastMessage:
          "All the development environments are now configured consistently.",
        timestamp: new Date().setDate(new Date().getDate() - 15),
      },
    ],
  },
];

type ChatSidebarProps = {
  isAudioPlaybackEnabled: boolean;
  setIsAudioPlaybackEnabled: React.Dispatch<React.SetStateAction<boolean>>;
};

function ChatSidebar({
  isAudioPlaybackEnabled,
  setIsAudioPlaybackEnabled,
}: ChatSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader className="flex flex-row items-center justify-between gap-2 px-2 py-4">
        <div className="flex flex-row items-center gap-2 px-2">
          <div className="bg-primary/10 size-8 rounded-md"></div>
          <div className="text-md font-base text-primary tracking-tight">
            what the sigma is abundant ui?
          </div>
        </div>
        <Button variant="ghost" className="size-8">
          <Search className="size-4" />
        </Button>
      </SidebarHeader>
      <SidebarContent className="pt-4">
        <div className="px-4">
          <Button
            variant="outline"
            className="mb-4 flex w-full items-center gap-2"
          >
            <PlusIcon className="size-4" />
            <span>New Chat</span>
          </Button>
        </div>
        {conversationHistory.map((group) => (
          <SidebarGroup key={group.period}>
            <SidebarGroupLabel>{group.period}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.conversations.map((conversation) => (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton>
                      <span>{conversation.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() =>
                    setIsAudioPlaybackEnabled((prev) => !prev)
                  }
                >
                  <span>Audio playback</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {isAudioPlaybackEnabled ? "On" : "Off"}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type BibleExcerptPayload = {
  reference: string;
  translation?: string;
  text: string;
};

type SemanticResult = {
  id: string;
  reference: string;
  summary: string;
  relevance: number;
};

type SemanticSearchPayload = {
  query: string;
  results: SemanticResult[];
};

type TodoPayload = {
  items: TodoItem[];
  error?: string;
};

type ToolModalState =
  | { type: "bible"; payload: BibleExcerptPayload }
  | { type: "search"; payload: SemanticSearchPayload }
  | { type: "todo"; payload: TodoPayload };

type ChatContentProps = {
  prompt: string;
  setPrompt: (value: string) => void;
  isLoading: boolean;
  isReady: boolean;
  isVoiceEnabled: boolean;
  onToggleVoice: () => void;
  chatMessages: ChatMessage[];
  onSubmit: () => void;
  isOrbMode: boolean;
  onToggleOrbMode: () => void;
  orbLayer: React.ReactNode;
};

function ChatContent({
  prompt,
  setPrompt,
  isLoading,
  isReady,
  isVoiceEnabled,
  onToggleVoice,
  chatMessages,
  onSubmit,
  isOrbMode,
  onToggleOrbMode,
  orbLayer,
}: ChatContentProps) {
  const isPromptDisabled = isVoiceEnabled && !isReady;

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="bg-background z-10 flex h-16 w-full shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <div className="text-foreground">erm what the sigma uwu O MAII GAHHHH UWU</div>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onToggleOrbMode}
          >
            {isOrbMode ? "Show chat" : "Orb mode"}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "relative flex-1",
          isOrbMode ? "overflow-hidden" : "overflow-y-auto"
        )}
      >
        <div
          className={cn(
            "absolute inset-0 z-0 flex items-center justify-center transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isOrbMode ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          {orbLayer}
        </div>
        <ChatContainerRoot
          className={cn(
            "relative z-10 h-full transition-[opacity,transform,filter] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isOrbMode
              ? "pointer-events-none scale-[0.98] opacity-0"
              : "opacity-100"
          )}
          aria-hidden={isOrbMode}
        >
          <ChatContainerContent className="space-y-0 px-5 py-12">
            {chatMessages.map((message, index) => {
              const isAssistant = message.role === "assistant";
              const isLastMessage = index === chatMessages.length - 1;

              return (
                <Message
                  key={message.id}
                  className={cn(
                    "mx-auto flex w-full max-w-3xl flex-col gap-2 px-6",
                    isAssistant ? "items-start" : "items-end"
                  )}
                >
                  {isAssistant ? (
                    <div className="group flex w-full flex-col gap-0">
                      <MessageContent
                        className="text-foreground prose flex-1 rounded-lg bg-transparent p-0"
                        markdown
                      >
                        {message.content}
                      </MessageContent>
                      <MessageActions
                        className={cn(
                          "-ml-2.5 flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                          isLastMessage && "opacity-100"
                        )}
                      >
                        <MessageAction tooltip="Copy" delayDuration={100}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                          >
                            <Copy />
                          </Button>
                        </MessageAction>
                        <MessageAction tooltip="Upvote" delayDuration={100}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                          >
                            <ThumbsUp />
                          </Button>
                        </MessageAction>
                        <MessageAction tooltip="Downvote" delayDuration={100}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                          >
                            <ThumbsDown />
                          </Button>
                        </MessageAction>
                      </MessageActions>
                    </div>
                  ) : (
                    <div className="group flex flex-col items-end gap-1">
                      <MessageContent className="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5 sm:max-w-[75%]">
                        {message.content}
                      </MessageContent>
                      <MessageActions
                        className={cn(
                          "flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        )}
                      >
                        <MessageAction tooltip="Edit" delayDuration={100}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                          >
                            <Pencil />
                          </Button>
                        </MessageAction>
                        <MessageAction tooltip="Delete" delayDuration={100}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                          >
                            <Trash />
                          </Button>
                        </MessageAction>
                        <MessageAction tooltip="Copy" delayDuration={100}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                          >
                            <Copy />
                          </Button>
                        </MessageAction>
                      </MessageActions>
                    </div>
                  )}
                </Message>
              );
            })}
          </ChatContainerContent>
          <div
            className={cn(
              "absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-end px-5 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              isOrbMode ? "pointer-events-none opacity-0" : "opacity-100"
            )}
          >
            <ScrollButton className="shadow-sm" />
          </div>
        </ChatContainerRoot>
      </div>

      <div className="bg-background z-10 shrink-0 px-3 pb-3 md:px-5 md:pb-5">
        <div className="mx-auto max-w-3xl">
          <PromptInput
            isLoading={isLoading}
            value={prompt}
            onValueChange={setPrompt}
            onSubmit={onSubmit}
            disabled={isPromptDisabled}
            className="border-input bg-popover relative z-10 w-full rounded-3xl border p-0 pt-1 shadow-xs"
          >
            <div className="flex flex-col">
              <PromptInputTextarea
                placeholder={
                  isVoiceEnabled
                    ? isReady
                      ? "Ask anything"
                      : "Connecting..."
                    : "Enable voice to start"
                }
                className="min-h-[44px] pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
              />

              <PromptInputActions className="mt-5 flex w-full items-center justify-between gap-2 px-3 pb-3">
                <div className="flex items-center gap-2">
                  <PromptInputAction tooltip="Add a new action">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 rounded-full"
                      disabled={!isReady}
                    >
                      <Plus size={18} />
                    </Button>
                  </PromptInputAction>

                  <PromptInputAction tooltip="Search">
                    <Button
                      variant="outline"
                      className="rounded-full"
                      disabled={!isReady}
                    >
                      <Globe size={18} />
                      Search
                    </Button>
                  </PromptInputAction>

                  <PromptInputAction tooltip="More actions">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 rounded-full"
                      disabled={!isReady}
                    >
                      <MoreHorizontal size={18} />
                    </Button>
                  </PromptInputAction>
                </div>
                <div className="flex items-center gap-2">
                  <PromptInputAction
                    tooltip={isVoiceEnabled ? "Disable voice" : "Enable voice"}
                    allowWhenDisabled
                  >
                    <Button
                      variant={isVoiceEnabled ? "default" : "outline"}
                      className="rounded-full"
                      onClick={onToggleVoice}
                    >
                      <Mic size={18} />
                      {isVoiceEnabled ? "Voice on" : "Enable voice"}
                    </Button>
                  </PromptInputAction>

                  <Button
                    size="icon"
                    disabled={!prompt.trim() || !isReady}
                    onClick={onSubmit}
                    className="size-9 rounded-full"
                  >
                    {!isLoading ? (
                      <ArrowUp size={18} />
                    ) : (
                      <span className="size-3 rounded-xs bg-white" />
                    )}
                  </Button>
                </div>
              </PromptInputActions>
            </div>
          </PromptInput>
        </div>
      </div>
    </main>
  );
}

function FullChatApp({
  isAudioPlaybackEnabled,
  setIsAudioPlaybackEnabled,
  isVoiceEnabled,
  onToggleVoice,
  prompt,
  setPrompt,
  isLoading,
  isReady,
  chatMessages,
  onSubmit,
  isOrbMode,
  onToggleOrbMode,
  orbLayer,
}: {
  isAudioPlaybackEnabled: boolean;
  setIsAudioPlaybackEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  isVoiceEnabled: boolean;
  onToggleVoice: () => void;
  prompt: string;
  setPrompt: (value: string) => void;
  isLoading: boolean;
  isReady: boolean;
  chatMessages: ChatMessage[];
  onSubmit: () => void;
  isOrbMode: boolean;
  onToggleOrbMode: () => void;
  orbLayer: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <ChatSidebar
        isAudioPlaybackEnabled={isAudioPlaybackEnabled}
        setIsAudioPlaybackEnabled={setIsAudioPlaybackEnabled}
      />
      <SidebarInset>
        <ChatContent
          prompt={prompt}
          setPrompt={setPrompt}
          isLoading={isLoading}
          isReady={isReady}
          isVoiceEnabled={isVoiceEnabled}
          onToggleVoice={onToggleVoice}
          chatMessages={chatMessages}
          onSubmit={onSubmit}
          isOrbMode={isOrbMode}
          onToggleOrbMode={onToggleOrbMode}
          orbLayer={orbLayer}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

function App() {
  const {
    addTranscriptMessage,
    addTranscriptBreadcrumb,
    transcriptItems,
  } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<
    RealtimeAgent[] | null
  >(null);
  const [toolModal, setToolModal] = useState<ToolModalState | null>(null);
  const [lastToolBreadcrumbId, setLastToolBreadcrumbId] = useState<
    string | null
  >(null);
  const [todoInput, setTodoInput] = useState("");

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null
  );
  const [orbOutputStream, setOrbOutputStream] = useState<MediaStream | null>(
    null
  );
  // Ref to identify whether the latest agent switch came from an automatic handoff
  const handoffTriggeredRef = useRef(false);
  const preferencesHydratedRef = useRef(false);
  const connectRetryAfterRef = useRef(0);
  const connectInFlightRef = useRef(false);
  const speakingStopTimeoutRef = useRef<number | null>(null);
  const assistantSpeakingRef = useRef(false);
  const lastAssistantAudioMsRef = useRef(0);
  const lastAppStateRef = useRef<Record<string, any> | null>(null);

  const { snapshot: appSnapshot, send: sendAppEvent } = useAppMachine({
    initialAudioPlaybackEnabled: true,
    initialVoiceEnabled: false,
    initialMode: "chat",
  });
  const {
    mode,
    voiceEnabled: isVoiceEnabled,
    audioPlaybackEnabled: isAudioPlaybackEnabled,
    sessionStatus,
    prompt,
    userSpeaking,
    assistantThinking,
    assistantSpeaking,
    orbState,
    orbAudioSource,
    orbIsListening,
    orbStateStartTimeMs: orbStateStartTime,
  } = appSnapshot.context;
  const isOrbMode = mode === "orb";

  useEffect(() => {
    const nextState = {
      mode,
      sessionStatus,
      voiceEnabled: isVoiceEnabled,
      audioPlaybackEnabled: isAudioPlaybackEnabled,
      userSpeaking,
      assistantThinking,
      assistantSpeaking,
      orbState,
      orbAudioSource,
      orbIsListening,
      orbStateStartTime,
    };

    const prevState = lastAppStateRef.current;
    if (!prevState) {
      postClientLog({ type: "app.state.init", payload: nextState });
      lastAppStateRef.current = nextState;
      return;
    }

    const diff: Record<string, { from: any; to: any }> = {};
    (Object.keys(nextState) as Array<keyof typeof nextState>).forEach((key) => {
      if (!Object.is(prevState[key], nextState[key])) {
        diff[key] = { from: prevState[key], to: nextState[key] };
      }
    });

    if (Object.keys(diff).length > 0) {
      postClientLog({
        type: "app.state.change",
        payload: { diff, next: nextState },
      });
    }

    lastAppStateRef.current = nextState;
  }, [
    mode,
    sessionStatus,
    isVoiceEnabled,
    isAudioPlaybackEnabled,
    userSpeaking,
    assistantThinking,
    assistantSpeaking,
    orbState,
    orbAudioSource,
    orbIsListening,
    orbStateStartTime,
  ]);

  const sdkAudioElement = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const el = document.createElement("audio");
    el.autoplay = true;
    el.style.display = "none";
    document.body.appendChild(el);
    return el;
  }, []);

  // Attach SDK audio element once it exists (after first render in browser)
  useEffect(() => {
    if (sdkAudioElement && !audioElementRef.current) {
      audioElementRef.current = sdkAudioElement;
      setAudioElement(sdkAudioElement);
    }
  }, [sdkAudioElement]);

  const setPrompt = useCallback(
    (value: string) => {
      sendAppEvent({ type: "PROMPT_CHANGED", value });
    },
    [sendAppEvent]
  );

  const setIsAudioPlaybackEnabled = useCallback(
    (value: React.SetStateAction<boolean>) => {
      const nextValue =
        typeof value === "function" ? value(isAudioPlaybackEnabled) : value;
      sendAppEvent({ type: "SET_AUDIO_PLAYBACK", value: nextValue });
    },
    [isAudioPlaybackEnabled, sendAppEvent]
  );

  const clearSpeakingStopTimeout = useCallback(() => {
    if (speakingStopTimeoutRef.current !== null) {
      window.clearTimeout(speakingStopTimeoutRef.current);
      speakingStopTimeoutRef.current = null;
    }
  }, []);

  const stopAssistantSpeakingNow = useCallback(
    (reason: string, emitEvent: boolean = true) => {
      clearSpeakingStopTimeout();
      if (assistantSpeakingRef.current) {
        if (emitEvent) {
          sendAppEvent({ type: "ASSISTANT_SPEAKING_STOP" });
        }
        assistantSpeakingRef.current = false;
        postClientLog({
          type: "assistant.speaking.stop",
          payload: { reason },
        });
      }
    },
    [clearSpeakingStopTimeout, sendAppEvent]
  );

  const scheduleAssistantSpeakingStop = useCallback(() => {
    clearSpeakingStopTimeout();
    speakingStopTimeoutRef.current = window.setTimeout(() => {
      const elapsed = Date.now() - lastAssistantAudioMsRef.current;
      if (
        elapsed >= ASSISTANT_SPEAKING_SILENCE_MS &&
        assistantSpeakingRef.current
      ) {
        stopAssistantSpeakingNow("silence");
      }
    }, ASSISTANT_SPEAKING_SILENCE_MS);
  }, [clearSpeakingStopTimeout, stopAssistantSpeakingNow]);

  const markAssistantAudioActivity = useCallback(
    (source: string) => {
      lastAssistantAudioMsRef.current = Date.now();
      if (!assistantSpeakingRef.current) {
        sendAppEvent({ type: "ASSISTANT_SPEAKING_START" });
        assistantSpeakingRef.current = true;
        postClientLog({
          type: "assistant.speaking.start",
          payload: { source },
        });
      }
      scheduleAssistantSpeakingStop();
    },
    [scheduleAssistantSpeakingStop, sendAppEvent]
  );

  useEffect(() => {
    if (!audioElement) return;

    const handlePlay = () => markAssistantAudioActivity("audio.play");
    const handlePlaying = () => markAssistantAudioActivity("audio.playing");
    const handlePause = () => scheduleAssistantSpeakingStop();
    const handleEnded = () => scheduleAssistantSpeakingStop();

    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("playing", handlePlaying);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("ended", handleEnded);

    return () => {
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("playing", handlePlaying);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener("ended", handleEnded);
    };
  }, [audioElement, markAssistantAudioActivity, scheduleAssistantSpeakingStop]);

  useEffect(() => {
    assistantSpeakingRef.current = assistantSpeaking;
  }, [assistantSpeaking]);

  useEffect(() => {
    return () => {
      clearSpeakingStopTimeout();
    };
  }, [clearSpeakingStopTimeout]);

  const handleTransportEvent = useCallback(
    (event: any) => {
      const transportEvent = event?.event ?? event;
      switch (transportEvent.type) {
        case "input_audio_buffer.speech_started":
          sendAppEvent({ type: "USER_SPEECH_START" });
          break;
        case "input_audio_buffer.speech_stopped":
          sendAppEvent({ type: "USER_SPEECH_STOP" });
          break;
        case "response.created":
          sendAppEvent({ type: "ASSISTANT_THINKING_START" });
          break;
        case "output_audio_buffer.started":
        case "response.audio.delta":
          markAssistantAudioActivity(transportEvent.type);
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          scheduleAssistantSpeakingStop();
          break;
        case "response.done":
        case "response.cancelled":
          stopAssistantSpeakingNow(transportEvent.type, false);
          sendAppEvent({ type: "ASSISTANT_IDLE" });
          break;
        case "error":
          stopAssistantSpeakingNow("error", false);
          sendAppEvent({ type: "ASSISTANT_IDLE" });
          sendAppEvent({ type: "USER_SPEECH_STOP" });
          break;
        default:
          break;
      }
    },
    [
      markAssistantAudioActivity,
      scheduleAssistantSpeakingStop,
      sendAppEvent,
      stopAssistantSpeakingNow,
    ]
  );

  const orbAudioMetricsRef = useOrbAudioMetrics({
    isActive: isOrbMode,
    sourceMode: orbAudioSource,
    audioElement,
    outputStream: orbOutputStream,
    enableMic: isVoiceEnabled,
  });

  const handleToggleOrbMode = useCallback(() => {
    sendAppEvent({ type: "TOGGLE_MODE" });
  }, [sendAppEvent]);

  const handleToggleVoice = useCallback(() => {
    sendAppEvent({ type: "TOGGLE_VOICE" });
  }, [sendAppEvent]);

  const handleConnectionChange = useCallback(
    (s: SessionStatus) => {
      sendAppEvent({ type: "SET_SESSION_STATUS", status: s as SessionStatus });
    },
    [sendAppEvent]
  );

  const handleAgentHandoff = useCallback((agentName: string) => {
    handoffTriggeredRef.current = true;
    setSelectedAgentName(agentName);
  }, []);

  const handleOutputAudioStream = useCallback((stream: MediaStream) => {
    setOrbOutputStream((prev) => (prev?.id === stream.id ? prev : stream));
  }, []);

  const realtimeCallbacks = useMemo(
    () => ({
      onConnectionChange: handleConnectionChange,
      onAgentHandoff: handleAgentHandoff,
      onTransportEvent: handleTransportEvent,
      onOutputAudioStream: handleOutputAudioStream,
    }),
    [
      handleConnectionChange,
      handleAgentHandoff,
      handleTransportEvent,
      handleOutputAudioStream,
    ]
  );

  const {
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    interrupt,
    mute,
  } = useRealtimeSession(realtimeCallbacks);

  const sendClientEvent = useCallback(
    (eventObj: any, eventNameSuffix = "") => {
      try {
        sendEvent(eventObj);
        logClientEvent(eventObj, eventNameSuffix);
      } catch {
      }
    },
    [logClientEvent, sendEvent]
  );

  const fetchEphemeralKey = useCallback(async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      sendAppEvent({ type: "SET_SESSION_STATUS", status: "DISCONNECTED" });
      return null;
    }

    return data.client_secret.value;
  }, [logClientEvent, logServerEvent, sendAppEvent]);

  const connectToRealtime = useCallback(async () => {
    const agentSetKey = defaultAgentSetKey;
    if (sdkScenarioMap[agentSetKey]) {
      if (sessionStatus !== "DISCONNECTED") return;
      const now = Date.now();
      if (now < connectRetryAfterRef.current) return;
      if (connectInFlightRef.current) return;

      try {
        connectInFlightRef.current = true;
        const EPHEMERAL_KEY = await fetchEphemeralKey();
        if (!EPHEMERAL_KEY) {
          connectRetryAfterRef.current = Date.now() + CONNECT_RETRY_MS;
          connectInFlightRef.current = false;
          return;
        }

        // Ensure the selectedAgentName is first so that it becomes the root
        const reorderedAgents = [...sdkScenarioMap[agentSetKey]];
        const idx = reorderedAgents.findIndex(
          (a) => a.name === selectedAgentName
        );
        if (idx > 0) {
          const [agent] = reorderedAgents.splice(idx, 1);
          reorderedAgents.unshift(agent);
        }

        const companyName = chatSupervisorCompanyName;
        const guardrail = createModerationGuardrail(companyName);

        await connect({
          getEphemeralKey: async () => EPHEMERAL_KEY,
          initialAgents: reorderedAgents,
          audioElement: sdkAudioElement,
          outputGuardrails: [guardrail],
          extraContext: {
            addTranscriptBreadcrumb,
          },
        });
      } catch {
        sendAppEvent({ type: "SET_SESSION_STATUS", status: "DISCONNECTED" });
        connectRetryAfterRef.current = Date.now() + CONNECT_RETRY_MS;
      } finally {
        connectInFlightRef.current = false;
      }
      return;
    }
  }, [
    addTranscriptBreadcrumb,
    connect,
    fetchEphemeralKey,
    sdkAudioElement,
    selectedAgentName,
    sendAppEvent,
    sessionStatus,
    connectInFlightRef,
  ]);

  const sendSimulatedUserMessage = useCallback(
    (text: string) => {
      const id = uuidv4().slice(0, 32);
      addTranscriptMessage(id, "user", text, true);

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          id,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      });
      sendClientEvent({ type: "response.create" }, "(simulated user text message)");
    },
    [addTranscriptMessage, sendClientEvent]
  );
  const updateSession = useCallback(
    (shouldTriggerResponse: boolean = false) => {
      // Keep server VAD enabled by default for a clean UI.
      const turnDetection = {
        type: "server_vad",
        threshold: 0.3,
        prefix_padding_ms: 200,
        silence_duration_ms: 500,
        create_response: true,
      };

      sendEvent({
        type: "session.update",
        session: {
          turn_detection: turnDetection,
        },
      });

      // Send an initial 'hi' message to trigger the agent to greet the user
      if (shouldTriggerResponse) {
        sendSimulatedUserMessage("hi");
      }
    },
    [sendEvent, sendSimulatedUserMessage]
  );

  useEffect(() => {
    const agents = allAgentSets[defaultAgentSetKey];
    const agentKeyToUse = agents[0]?.name || "";

    setSelectedAgentName(agentKeyToUse);
    setSelectedAgentConfigSet(agents);
  }, []);

  useEffect(() => {
    if (!isVoiceEnabled) return;
    if (selectedAgentName && sessionStatus === "DISCONNECTED") {
      connectToRealtime();
    }
  }, [selectedAgentName, isVoiceEnabled, sessionStatus, connectToRealtime]);

  useEffect(() => {
    if (isVoiceEnabled) return;
    if (sessionStatus !== "DISCONNECTED") {
      disconnect();
    }
  }, [isVoiceEnabled, sessionStatus, disconnect]);

  useEffect(() => {
    if (!isVoiceEnabled) {
      connectRetryAfterRef.current = 0;
      connectInFlightRef.current = false;
    }
  }, [isVoiceEnabled]);

  useEffect(() => {
    if (sessionStatus === "DISCONNECTED") {
      setOrbOutputStream(null);
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(`Agent: ${selectedAgentName}`, currentAgent);
      updateSession(!handoffTriggeredRef.current);
      // Reset flag after handling so subsequent effects behave normally
      handoffTriggeredRef.current = false;
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus, updateSession]);

  useEffect(() => {
    if (preferencesHydratedRef.current) return;
    preferencesHydratedRef.current = true;
    const storedPlayback = localStorage.getItem("audioPlaybackEnabled");
    if (storedPlayback !== null) {
      sendAppEvent({
        type: "SET_AUDIO_PLAYBACK",
        value: storedPlayback === "true",
      });
    }
    const storedVoice = localStorage.getItem("voiceEnabled");
    if (storedVoice !== null) {
      sendAppEvent({
        type: "SET_VOICE_ENABLED",
        value: storedVoice === "true",
      });
    }
  }, [sendAppEvent]);

  const handleSubmit = () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || sessionStatus !== "CONNECTED") return;
    interrupt();

    try {
      sendUserText(trimmedPrompt);
    } catch {
    }

    sendAppEvent({ type: "CLEAR_PROMPT" });
  };

  useEffect(() => {
    if (!preferencesHydratedRef.current) return;
    localStorage.setItem(
      "audioPlaybackEnabled",
      isAudioPlaybackEnabled.toString()
    );
    localStorage.setItem("voiceEnabled", isVoiceEnabled.toString());
  }, [isAudioPlaybackEnabled, isVoiceEnabled]);

  useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.muted = false;
        audioElementRef.current.play().catch(() => {
        });
      } else {
        // Mute and pause to avoid brief audio blips before pause takes effect.
        audioElementRef.current.muted = true;
        audioElementRef.current.pause();
      }
    }

    // Toggle server-side audio stream mute so bandwidth is saved when the
    // user disables playback.
    try {
      mute(!isAudioPlaybackEnabled);
    } catch {
    }
  }, [isAudioPlaybackEnabled, mute]);

  // Ensure mute state is propagated to transport right after we connect or
  // whenever the SDK client reference becomes available.
  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      try {
        mute(!isAudioPlaybackEnabled);
      } catch {
      }
    }
  }, [sessionStatus, isAudioPlaybackEnabled, mute]);

  useEffect(() => {
    const breadcrumbs = [...transcriptItems]
      .filter((item) => item.type === "BREADCRUMB" && item.title)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    const latest = breadcrumbs[breadcrumbs.length - 1];
    if (!latest || latest.itemId === lastToolBreadcrumbId) return;

    const title = latest.title ?? "";
    const match = title.match(/function call result: (.+)$/);
    const toolName = match?.[1]?.trim();

    if (!toolName) return;

    const payload = latest.data ?? {};
    switch (toolName) {
      case "getBibleExcerpt": {
        setToolModal({ type: "bible", payload: payload as BibleExcerptPayload });
        break;
      }
      case "searchBibleSemantic": {
        setToolModal({
          type: "search",
          payload: payload as SemanticSearchPayload,
        });
        break;
      }
      case "getTodoList":
      case "addTodoItem":
      case "completeTodoItem": {
        const items = Array.isArray((payload as TodoPayload).items)
          ? (payload as TodoPayload).items
          : getTodoItems();
        setToolModal({
          type: "todo",
          payload: { ...(payload as TodoPayload), items },
        });
        break;
      }
      default:
        break;
    }

    setLastToolBreadcrumbId(latest.itemId);
  }, [transcriptItems, lastToolBreadcrumbId]);

  const chatMessages = useMemo<ChatMessage[]>(() => {
    return [...transcriptItems]
      .filter((item) => item.type === "MESSAGE" && !item.isHidden)
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .map((item) => ({
        id: item.itemId,
        role: item.role ?? "assistant",
        content: item.title ?? "",
      }));
  }, [transcriptItems]);

  const isReady = sessionStatus === "CONNECTED";
  const isLoading = sessionStatus === "CONNECTING";

  const handleModalClose = () => {
    setToolModal(null);
    setTodoInput("");
  };

  const handleTodoSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = todoInput.trim();
    if (!text) return;
    const items = addTodoItem(text);
    setTodoInput("");
    setToolModal({ type: "todo", payload: { items } });
  };

  const handleTodoToggle = (id: string) => {
    const items = toggleTodoItem(id);
    setToolModal({ type: "todo", payload: { items } });
  };

  return (
    <>
      <FullChatApp
        isAudioPlaybackEnabled={isAudioPlaybackEnabled}
        setIsAudioPlaybackEnabled={setIsAudioPlaybackEnabled}
        isVoiceEnabled={isVoiceEnabled}
        onToggleVoice={handleToggleVoice}
        prompt={prompt}
        setPrompt={setPrompt}
        isLoading={isLoading}
        isReady={isReady}
        chatMessages={chatMessages}
        onSubmit={handleSubmit}
        isOrbMode={isOrbMode}
        onToggleOrbMode={handleToggleOrbMode}
        orbLayer={
          <OrbVisualizationClient
            audioMetricsRef={orbAudioMetricsRef}
            orbState={orbState}
            stateStartTimeMs={orbStateStartTime}
            isListening={orbIsListening}
            size={320}
            className="h-full w-full"
          />
        }
      />
      <ToolModal
        open={Boolean(toolModal)}
        title={
          toolModal?.type === "bible"
            ? "Bible Excerpt"
            : toolModal?.type === "search"
              ? "Related Passages"
              : "Todo List"
        }
        onClose={handleModalClose}
      >
        {toolModal?.type === "bible" && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {toolModal.payload.reference}
              {toolModal.payload.translation
                ? ` · ${toolModal.payload.translation}`
                : ""}
            </div>
            <p className="text-base text-foreground">
              {toolModal.payload.text}
            </p>
          </div>
        )}
        {toolModal?.type === "search" && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Query: {toolModal.payload.query}
            </div>
            <div className="space-y-2">
              {toolModal.payload.results.map((result) => (
                <div
                  key={result.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="text-sm font-medium text-foreground">
                    {result.reference}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {result.summary}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {toolModal?.type === "todo" && (
          <div className="space-y-4">
            {toolModal.payload.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {toolModal.payload.error}
              </div>
            )}
            <form className="flex gap-2" onSubmit={handleTodoSubmit}>
              <input
                value={todoInput}
                onChange={(event) => setTodoInput(event.target.value)}
                placeholder="Add a new task"
                className="border-input bg-background text-foreground placeholder:text-muted-foreground flex-1 rounded-md border px-3 py-2 text-sm"
              />
              <Button type="submit" size="sm">
                Add
              </Button>
            </form>
            <div className="space-y-2">
              {toolModal.payload.items.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No tasks yet. Add one above.
                </div>
              ) : (
                toolModal.payload.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => handleTodoToggle(item.id)}
                      className="accent-foreground"
                    />
                    <span
                      className={cn(
                        "text-sm text-foreground",
                        item.completed && "text-muted-foreground line-through"
                      )}
                    >
                      {item.text}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </ToolModal>
    </>
  );
}

export default App;
