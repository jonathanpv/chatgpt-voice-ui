"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { OrbVisualization, type OrbState } from "@/app/components/OrbVisualization";
import { useOrbAudioMetrics } from "@/app/hooks/useOrbAudioMetrics";
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
  isOrbMode: boolean;
};

function ChatSidebar({
  isAudioPlaybackEnabled,
  setIsAudioPlaybackEnabled,
  isOrbMode,
}: ChatSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader className="flex flex-row items-center justify-between gap-2 px-2 py-4">
        <div className="flex flex-row items-center gap-2 px-2">
          <div className="bg-primary/10 size-8 rounded-md"></div>
          <div className="text-md font-base text-primary tracking-tight">
            abundantui
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
        <div className="text-foreground">Chat Supervisor</div>
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
              ? "pointer-events-none scale-[0.98] opacity-0 blur-[1px]"
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
        isOrbMode={isOrbMode}
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
  const searchParams = useSearchParams()!;
  const router = useRouter();

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

  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");
  const [prompt, setPrompt] = useState<string>("");
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return true;
      const stored = localStorage.getItem("audioPlaybackEnabled");
      return stored ? stored === "true" : true;
    }
  );
  const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("voiceEnabled");
    return stored ? stored === "true" : false;
  });

  const isOrbMode = searchParams.get("mode") === "orb";

  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [orbStateStartTime, setOrbStateStartTime] = useState<number>(() => {
    if (typeof performance === "undefined") return 0;
    return performance.now();
  });
  const [orbIsListening, setOrbIsListening] = useState(false);
  const [orbAudioSource, setOrbAudioSource] = useState<
    "mic" | "output" | "idle"
  >("idle");
  const orbFlagsRef = useRef({
    userSpeaking: false,
    assistantThinking: false,
    assistantSpeaking: false,
  });

  const setOrbStateWithTime = useCallback((next: OrbState) => {
    setOrbState((prev) => {
      if (prev !== next && typeof performance !== "undefined") {
        setOrbStateStartTime(performance.now());
      }
      return next;
    });
  }, []);

  const updateOrbDerivedState = useCallback(() => {
    if (!isVoiceEnabled || sessionStatus !== "CONNECTED") {
      setOrbStateWithTime(isOrbMode ? "listen" : "idle");
      setOrbAudioSource("idle");
      setOrbIsListening(isOrbMode);
      return;
    }

    const { userSpeaking, assistantThinking, assistantSpeaking } =
      orbFlagsRef.current;

    if (assistantSpeaking) {
      setOrbStateWithTime("speak");
      setOrbAudioSource("output");
      setOrbIsListening(false);
      return;
    }

    if (assistantThinking) {
      setOrbStateWithTime("think");
      setOrbAudioSource("idle");
      setOrbIsListening(!userSpeaking);
      return;
    }

    setOrbStateWithTime("listen");
    setOrbAudioSource(userSpeaking ? "mic" : "idle");
    setOrbIsListening(!assistantSpeaking && !userSpeaking);
  }, [isOrbMode, isVoiceEnabled, sessionStatus, setOrbStateWithTime]);

  const handleTransportEvent = useCallback(
    (event: any) => {
      const transportEvent = event?.event ?? event;
      switch (transportEvent.type) {
        case "input_audio_buffer.speech_started":
          orbFlagsRef.current.userSpeaking = true;
          break;
        case "input_audio_buffer.speech_stopped":
          orbFlagsRef.current.userSpeaking = false;
          break;
        case "response.created":
          orbFlagsRef.current.assistantThinking = true;
          break;
        case "output_audio_buffer.started":
        case "response.audio.delta":
          orbFlagsRef.current.assistantSpeaking = true;
          orbFlagsRef.current.assistantThinking = false;
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
        case "response.audio.done":
          orbFlagsRef.current.assistantSpeaking = false;
          break;
        case "response.done":
        case "response.cancelled":
          orbFlagsRef.current.assistantThinking = false;
          orbFlagsRef.current.assistantSpeaking = false;
          break;
        case "error":
          orbFlagsRef.current.assistantThinking = false;
          orbFlagsRef.current.assistantSpeaking = false;
          orbFlagsRef.current.userSpeaking = false;
          break;
        default:
          break;
      }

      updateOrbDerivedState();
    },
    [updateOrbDerivedState]
  );

  useEffect(() => {
    updateOrbDerivedState();
  }, [updateOrbDerivedState]);

  const orbAudioMetricsRef = useOrbAudioMetrics({
    isActive: isOrbMode,
    sourceMode: orbAudioSource,
    audioElement,
    outputStream: orbOutputStream,
    enableMic: isVoiceEnabled,
  });

  const handleToggleOrbMode = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (isOrbMode) {
      url.searchParams.delete("mode");
    } else {
      url.searchParams.set("mode", "orb");
    }
    const next = `${url.pathname}${url.search}`;
    router.replace(next);
  }, [isOrbMode, router]);

  const {
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    interrupt,
    mute,
  } = useRealtimeSession({
    onConnectionChange: (s) => setSessionStatus(s as SessionStatus),
    onAgentHandoff: (agentName: string) => {
      handoffTriggeredRef.current = true;
      setSelectedAgentName(agentName);
    },
    onTransportEvent: handleTransportEvent,
    onOutputAudioStream: (stream: MediaStream) => {
      setOrbOutputStream((prev) => (prev?.id === stream.id ? prev : stream));
    },
  });

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    try {
      sendEvent(eventObj);
      logClientEvent(eventObj, eventNameSuffix);
    } catch (err) {
      console.error("Failed to send via SDK", err);
    }
  };

  useEffect(() => {
    let finalAgentConfig = searchParams.get("agentConfig");
    if (!finalAgentConfig || !allAgentSets[finalAgentConfig]) {
      finalAgentConfig = defaultAgentSetKey;
      const url = new URL(window.location.toString());
      url.searchParams.set("agentConfig", finalAgentConfig);
      window.location.replace(url.toString());
      return;
    }

    const agents = allAgentSets[finalAgentConfig];
    const agentKeyToUse = agents[0]?.name || "";

    setSelectedAgentName(agentKeyToUse);
    setSelectedAgentConfigSet(agents);
  }, [searchParams]);

  useEffect(() => {
    if (!isVoiceEnabled) return;
    if (selectedAgentName && sessionStatus === "DISCONNECTED") {
      connectToRealtime();
    }
  }, [selectedAgentName, isVoiceEnabled]);

  useEffect(() => {
    if (isVoiceEnabled) return;
    if (sessionStatus !== "DISCONNECTED") {
      disconnect();
    }
  }, [isVoiceEnabled, sessionStatus, disconnect]);

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
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus]);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }

    return data.client_secret.value;
  };

  const connectToRealtime = async () => {
    const agentSetKey = searchParams.get("agentConfig") || "default";
    if (sdkScenarioMap[agentSetKey]) {
      if (sessionStatus !== "DISCONNECTED") return;
      setSessionStatus("CONNECTING");

      try {
        const EPHEMERAL_KEY = await fetchEphemeralKey();
        if (!EPHEMERAL_KEY) return;

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
      } catch (err) {
        console.error("Error connecting via SDK:", err);
        setSessionStatus("DISCONNECTED");
      }
      return;
    }
  };

  const sendSimulatedUserMessage = (text: string) => {
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
  };

  const updateSession = (shouldTriggerResponse: boolean = false) => {
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
    return;
  };

  const handleSubmit = () => {
    if (!prompt.trim() || sessionStatus !== "CONNECTED") return;
    interrupt();

    try {
      sendUserText(prompt.trim());
    } catch (err) {
      console.error("Failed to send via SDK", err);
    }

    setPrompt("");
  };

  useEffect(() => {
    localStorage.setItem(
      "audioPlaybackEnabled",
      isAudioPlaybackEnabled.toString()
    );
  }, [isAudioPlaybackEnabled]);
  useEffect(() => {
    localStorage.setItem("voiceEnabled", isVoiceEnabled.toString());
  }, [isVoiceEnabled]);

  useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.muted = false;
        audioElementRef.current.play().catch((err) => {
          console.warn("Autoplay may be blocked by browser:", err);
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
    } catch (err) {
      console.warn("Failed to toggle SDK mute", err);
    }
  }, [isAudioPlaybackEnabled]);

  // Ensure mute state is propagated to transport right after we connect or
  // whenever the SDK client reference becomes available.
  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      try {
        mute(!isAudioPlaybackEnabled);
      } catch (err) {
        console.warn("mute sync after connect failed", err);
      }
    }
  }, [sessionStatus, isAudioPlaybackEnabled]);

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
        onToggleVoice={() => setIsVoiceEnabled((prev) => !prev)}
        prompt={prompt}
        setPrompt={setPrompt}
        isLoading={isLoading}
        isReady={isReady}
        chatMessages={chatMessages}
        onSubmit={handleSubmit}
        isOrbMode={isOrbMode}
        onToggleOrbMode={handleToggleOrbMode}
        orbLayer={
          <OrbVisualization
            audioMetricsRef={orbAudioMetricsRef}
            orbState={orbState}
            stateStartTimeMs={orbStateStartTime}
            isListening={orbIsListening}
            isActive={isOrbMode}
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
