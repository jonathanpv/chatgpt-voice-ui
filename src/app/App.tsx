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
import type { OrbState } from "@/app/components/OrbVisualization";
import type { OrbAudioSource } from "@/app/state/appMachine";
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
import { SessionStatus, type ChatMessage } from "@/app/types";
import type { RealtimeAgent } from "@openai/agents/realtime";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";

import {
  ChatActionsProvider,
  ChatOrbProvider,
  ChatStatusProvider,
  ChatViewProvider,
  useChatActions,
  useChatOrb,
  useChatStatus,
  useChatView,
} from "@/app/contexts/ChatUIContext";
import { useRealtimeSession } from "@/app/hooks/useRealtimeSession";
import { createModerationGuardrail } from "@/app/agentConfigs/guardrails";
import { TooltipProvider } from "@/components/ui/tooltip";

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

const ChatSidebar = React.memo(function ChatSidebar() {
  const { isAudioPlaybackEnabled } = useChatStatus();
  const { setAudioPlaybackEnabled } = useChatActions();

  return (
    <Sidebar>
      <SidebarHeader className="flex flex-row items-center justify-between gap-2 px-2 py-4">
        <div className="flex flex-row items-center gap-2 px-2">
          <div className="bg-primary/10 size-8 rounded-md"></div>
          <div className="text-md font-base text-primary tracking-tight">
            abundant ui
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
                    setAudioPlaybackEnabled((prev) => !prev)
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
});

ChatSidebar.displayName = "ChatSidebar";

type TodoPayload = {
  items: TodoItem[];
  error?: string;
};

type ToolModalState =
  | { type: "todo"; payload: TodoPayload };

const ChatHeader = React.memo(function ChatHeader() {
  const { isOrbMode } = useChatOrb();
  const { toggleOrbMode } = useChatActions();

  return (
    <header className="bg-background z-10 flex h-16 w-full shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="text-foreground">
        abundant ui voice template
      </div>
      <div className="ml-auto">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={toggleOrbMode}
        >
          {isOrbMode ? "Show chat" : "Orb mode"}
        </Button>
      </div>
    </header>
  );
});

ChatHeader.displayName = "ChatHeader";

const ChatMessagesView = React.memo(function ChatMessagesView() {
  const { chatMessages, orbLayer } = useChatView();
  const { isOrbMode } = useChatOrb();

  return (
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
            return (
              <MessageRow
                key={message.id}
                message={message}
                isLastMessage={index === chatMessages.length - 1}
              />
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
  );
});

ChatMessagesView.displayName = "ChatMessagesView";

type MessageRowProps = {
  message: ChatMessage;
  isLastMessage: boolean;
};

const MessageRow = React.memo(function MessageRow({
  message,
  isLastMessage,
}: MessageRowProps) {
  const isAssistant = message.role === "assistant";

  return (
    <Message
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
});

MessageRow.displayName = "MessageRow";

function ChatComposer() {
  const { isLoading, isReady, isVoiceEnabled } = useChatStatus();
  const { toggleVoice, submitPrompt } = useChatActions();
  const isPromptDisabled = isVoiceEnabled && !isReady;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sendButtonRef = useRef<HTMLButtonElement | null>(null);
  const [clearSignal, setClearSignal] = useState(0);

  const handleSubmit = () => {
    const value = textareaRef.current?.value?.trim() ?? "";
    if (!value || !isReady) return;
    submitPrompt(value);
    setClearSignal((prev) => prev + 1);
    if (sendButtonRef.current) {
      sendButtonRef.current.disabled = true;
    }
  };

  const handleInputValueChange = (value: string) => {
    if (!sendButtonRef.current) return;
    sendButtonRef.current.disabled = !value.trim() || !isReady;
  };

  useEffect(() => {
    if (!sendButtonRef.current) return;
    const value = textareaRef.current?.value ?? "";
    sendButtonRef.current.disabled = !value.trim() || !isReady;
  }, [isReady]);

  return (
    <div className="bg-background z-10 shrink-0 px-3 pb-3 md:px-5 md:pb-5">
      <div className="mx-auto max-w-3xl">
        <PromptInput
          isLoading={isLoading}
          onValueChange={handleInputValueChange}
          onSubmit={handleSubmit}
          disabled={isPromptDisabled}
          clearSignal={clearSignal}
          textareaRef={textareaRef}
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
              <ChatComposerActions />
              <ChatComposerSubmit
                buttonRef={sendButtonRef}
                isLoading={isLoading}
                isReady={isReady}
                onSubmit={handleSubmit}
              />
            </PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </div>
  );
}

const ChatComposerActions = React.memo(function ChatComposerActions() {
  const { isReady, isVoiceEnabled } = useChatStatus();
  const { toggleVoice } = useChatActions();

  return (
    <div className="w-full flex flex-row justify-between">
      <div className="flex items-center  gap-2">
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
      
        <PromptInputAction
          tooltip={isVoiceEnabled ? "Disable voice" : "Enable voice"}
          allowWhenDisabled
        >
          <Button
            variant={isVoiceEnabled ? "default" : "outline"}
            className="rounded-full"
            onClick={toggleVoice}
          >
            <Mic size={18} />
            {isVoiceEnabled ? "Disconnect" : "Connect"}
          </Button>
        </PromptInputAction>
    </div>
  );
});

ChatComposerActions.displayName = "ChatComposerActions";

function ChatComposerSubmit({
  buttonRef,
  isLoading,
  isReady,
  onSubmit,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  isLoading: boolean;
  isReady: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        ref={buttonRef}
        size="icon"
        disabled={!isReady}
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
  );
}

const ChatContent = React.memo(function ChatContent() {
  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <ChatHeader />
      <ChatMessagesView />
      <ChatComposer />
    </main>
  );
});

ChatContent.displayName = "ChatContent";

const FullChatApp = React.memo(function FullChatApp() {
  return (
    <SidebarProvider>
      <ChatSidebar />
      <SidebarInset>
        <ChatContent />
      </SidebarInset>
    </SidebarProvider>
  );
});

FullChatApp.displayName = "FullChatApp";

function App() {
  const {
    addTranscriptMessage,
    addTranscriptBreadcrumb,
    transcriptItems,
  } = useTranscript();
  

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
  const assistantThinkingRef = useRef(false);
  const userSpeakingRef = useRef(false);
  const lastAssistantAudioMsRef = useRef(0);
  const chatMessageCacheRef = useRef(new Map<string, ChatMessage>());
  const orbStateRef = useRef<OrbState>("idle");
  const orbAudioSourceRef = useRef<OrbAudioSource>("idle");
  const orbIsListeningRef = useRef(false);
  const orbStateStartTimeRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );
  const lastOrbModeRef = useRef<"chat" | "orb">("chat");

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
  } = appSnapshot.context;
  const isOrbMode = mode === "orb";

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

  const setIsAudioPlaybackEnabled = useCallback(
    (value: React.SetStateAction<boolean>) => {
      const nextValue =
        typeof value === "function" ? value(isAudioPlaybackEnabled) : value;
      sendAppEvent({ type: "SET_AUDIO_PLAYBACK", value: nextValue });
    },
    [isAudioPlaybackEnabled, sendAppEvent]
  );

  const getNowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const getOrbPhase = (state: OrbState) => {
    if (state === "listen" || state === "think" || state === "speak") {
      return "active";
    }
    return state;
  };

  const syncOrbView = useCallback(
    (reason: string) => {
      const isConnected = sessionStatus === "CONNECTED";
      let nextState: OrbState;
      let nextAudioSource: OrbAudioSource;
      let nextIsListening: boolean;

      if (!isVoiceEnabled || !isConnected) {
        nextState = isOrbMode ? "listen" : "idle";
        nextAudioSource = "idle";
        nextIsListening = isOrbMode;
      } else if (assistantSpeakingRef.current) {
        nextState = "speak";
        nextAudioSource = "output";
        nextIsListening = false;
      } else if (assistantThinkingRef.current) {
        nextState = "think";
        nextAudioSource = "idle";
        nextIsListening = false;
      } else {
        const userSpeaking = userSpeakingRef.current;
        nextState = "listen";
        nextAudioSource = userSpeaking ? "mic" : "idle";
        nextIsListening = !userSpeaking;
      }

      const prevState = orbStateRef.current;
      const prevPhase = getOrbPhase(prevState);
      const nextPhase = getOrbPhase(nextState);
      const modeActivated = lastOrbModeRef.current !== "orb" && isOrbMode;
      const shouldResetStartTime = modeActivated || prevPhase !== nextPhase;

      if (shouldResetStartTime) {
        orbStateStartTimeRef.current = getNowMs();
      }

      orbStateRef.current = nextState;
      orbAudioSourceRef.current = nextAudioSource;
      orbIsListeningRef.current = nextIsListening;
      lastOrbModeRef.current = isOrbMode ? "orb" : "chat";

      void reason;
    },
    [isOrbMode, isVoiceEnabled, sessionStatus]
  );

  useEffect(() => {
    if (!isVoiceEnabled || sessionStatus !== "CONNECTED") {
      assistantSpeakingRef.current = false;
      assistantThinkingRef.current = false;
      userSpeakingRef.current = false;
    }
    syncOrbView("app_state_change");
  }, [isOrbMode, isVoiceEnabled, sessionStatus, syncOrbView]);

  useEffect(() => {
    if (audioElement) {
      syncOrbView("audio_element_ready");
    }
  }, [audioElement, syncOrbView]);

  const clearSpeakingStopTimeout = useCallback(() => {
    if (speakingStopTimeoutRef.current !== null) {
      window.clearTimeout(speakingStopTimeoutRef.current);
      speakingStopTimeoutRef.current = null;
    }
  }, []);

  const stopAssistantSpeakingNow = useCallback(
    (reason: string) => {
      clearSpeakingStopTimeout();
      if (assistantSpeakingRef.current) {
        assistantSpeakingRef.current = false;
        postClientLog({
          type: "assistant.speaking.stop",
          payload: { reason },
        });
        syncOrbView("assistant_speaking_stop");
      }
    },
    [clearSpeakingStopTimeout, syncOrbView]
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
        assistantSpeakingRef.current = true;
        assistantThinkingRef.current = false;
        postClientLog({
          type: "assistant.speaking.start",
          payload: { source },
        });
        syncOrbView("assistant_speaking_start");
      }
      scheduleAssistantSpeakingStop();
    },
    [scheduleAssistantSpeakingStop, syncOrbView]
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
    return () => {
      clearSpeakingStopTimeout();
    };
  }, [clearSpeakingStopTimeout]);

  const handleTransportEvent = useCallback(
    (event: any) => {
      const transportEvent = event?.event ?? event;
      switch (transportEvent.type) {
        case "input_audio_buffer.speech_started":
          userSpeakingRef.current = true;
          syncOrbView("user_speech_start");
          break;
        case "input_audio_buffer.speech_stopped":
          userSpeakingRef.current = false;
          syncOrbView("user_speech_stop");
          break;
        case "response.created":
          assistantThinkingRef.current = true;
          assistantSpeakingRef.current = false;
          syncOrbView("assistant_thinking_start");
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
          assistantThinkingRef.current = false;
          stopAssistantSpeakingNow(transportEvent.type);
          syncOrbView("assistant_done");
          break;
        case "error":
          assistantThinkingRef.current = false;
          assistantSpeakingRef.current = false;
          userSpeakingRef.current = false;
          stopAssistantSpeakingNow("error");
          syncOrbView("error");
          break;
        default:
          break;
      }
    },
    [
      markAssistantAudioActivity,
      scheduleAssistantSpeakingStop,
      syncOrbView,
      stopAssistantSpeakingNow,
    ]
  );

  const orbAudioMetricsRef = useOrbAudioMetrics({
    isActive: true,
    sourceModeRef: orbAudioSourceRef,
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
      if (s !== "CONNECTED") {
        assistantSpeakingRef.current = false;
        assistantThinkingRef.current = false;
        userSpeakingRef.current = false;
      }
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
        
      } catch {
      }
    },
    [ sendEvent]
  );

  const fetchEphemeralKey = useCallback(async (): Promise<string | null> => {
    
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    

    if (!data.client_secret?.value) {
    
      sendAppEvent({ type: "SET_SESSION_STATUS", status: "DISCONNECTED" });
      return null;
    }

    return data.client_secret.value;
  }, [sendAppEvent]);

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

  const handleSubmitPrompt = useCallback(
    (value: string) => {
      const trimmedPrompt = value.trim();
      if (!trimmedPrompt || sessionStatus !== "CONNECTED") return;
      interrupt();

      try {
        sendUserText(trimmedPrompt);
      } catch {
      }
    },
    [interrupt, sendUserText, sessionStatus]
  );

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
    const nextItems = [...transcriptItems]
      .filter((item) => item.type === "MESSAGE" && !item.isHidden)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
    const nextMessages: ChatMessage[] = [];
    const nextIds = new Set<string>();
    const cache = chatMessageCacheRef.current;

    for (const item of nextItems) {
      const id = item.itemId;
      const role = item.role ?? "assistant";
      const content = item.title ?? "";
      nextIds.add(id);

      const cached = cache.get(id);
      if (cached && cached.role === role && cached.content === content) {
        nextMessages.push(cached);
        continue;
      }

      const nextMessage = { id, role, content };
      cache.set(id, nextMessage);
      nextMessages.push(nextMessage);
    }

    for (const id of cache.keys()) {
      if (!nextIds.has(id)) {
        cache.delete(id);
      }
    }

    return nextMessages;
  }, [transcriptItems]);

  const orbLayer = useMemo(
    () => (
      <OrbVisualizationClient
        audioMetricsRef={orbAudioMetricsRef}
        orbStateRef={orbStateRef}
        stateStartTimeMsRef={orbStateStartTimeRef}
        isListeningRef={orbIsListeningRef}
        size={320}
        className="h-full w-full"
      />
    ),
    [orbAudioMetricsRef, orbIsListeningRef, orbStateRef, orbStateStartTimeRef]
  );

  const isReady = sessionStatus === "CONNECTED";
  const isLoading = sessionStatus === "CONNECTING";

  const chatStatus = useMemo(
    () => ({
      isAudioPlaybackEnabled,
      isVoiceEnabled,
      isReady,
      isLoading,
    }),
    [isAudioPlaybackEnabled, isLoading, isReady, isVoiceEnabled]
  );

  const chatOrb = useMemo(
    () => ({ isOrbMode }),
    [isOrbMode]
  );

  const chatActions = useMemo(
    () => ({
      toggleVoice: handleToggleVoice,
      toggleOrbMode: handleToggleOrbMode,
      submitPrompt: handleSubmitPrompt,
      setAudioPlaybackEnabled: setIsAudioPlaybackEnabled,
    }),
    [
      handleSubmitPrompt,
      handleToggleOrbMode,
      handleToggleVoice,
      setIsAudioPlaybackEnabled,
    ]
  );

  const chatView = useMemo(
    () => ({ chatMessages, orbLayer }),
    [chatMessages, orbLayer]
  );

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
      <TooltipProvider>
        <ChatStatusProvider value={chatStatus}>
          <ChatOrbProvider value={chatOrb}>
            <ChatActionsProvider value={chatActions}>
              <ChatViewProvider value={chatView}>
                <FullChatApp />
              </ChatViewProvider>
            </ChatActionsProvider>
          </ChatOrbProvider>
        </ChatStatusProvider>
      </TooltipProvider>
      <ToolModal
        open={Boolean(toolModal)}
        title="Todo List"
        onClose={handleModalClose}
      >
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
