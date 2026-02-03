"use client";

import React, { createContext, useContext } from "react";
import type { ChatMessage } from "@/app/types";

export type ChatStatusContextValue = {
  isAudioPlaybackEnabled: boolean;
  isVoiceEnabled: boolean;
  isReady: boolean;
  isLoading: boolean;
};

export type ChatOrbContextValue = {
  isOrbMode: boolean;
};

export type ChatActionsContextValue = {
  toggleVoice: () => void;
  toggleOrbMode: () => void;
  submitPrompt: (prompt: string) => void;
  setAudioPlaybackEnabled: React.Dispatch<React.SetStateAction<boolean>>;
};

export type ChatViewContextValue = {
  chatMessages: ChatMessage[];
  orbLayer: React.ReactNode;
};

const ChatStatusContext = createContext<ChatStatusContextValue | null>(null);
const ChatOrbContext = createContext<ChatOrbContextValue | null>(null);
const ChatActionsContext = createContext<ChatActionsContextValue | null>(null);
const ChatViewContext = createContext<ChatViewContextValue | null>(null);

export function ChatStatusProvider({
  value,
  children,
}: React.PropsWithChildren<{ value: ChatStatusContextValue }>) {
  return (
    <ChatStatusContext.Provider value={value}>
      {children}
    </ChatStatusContext.Provider>
  );
}

export function ChatOrbProvider({
  value,
  children,
}: React.PropsWithChildren<{ value: ChatOrbContextValue }>) {
  return (
    <ChatOrbContext.Provider value={value}>
      {children}
    </ChatOrbContext.Provider>
  );
}

export function ChatActionsProvider({
  value,
  children,
}: React.PropsWithChildren<{ value: ChatActionsContextValue }>) {
  return (
    <ChatActionsContext.Provider value={value}>
      {children}
    </ChatActionsContext.Provider>
  );
}

export function ChatViewProvider({
  value,
  children,
}: React.PropsWithChildren<{ value: ChatViewContextValue }>) {
  return (
    <ChatViewContext.Provider value={value}>
      {children}
    </ChatViewContext.Provider>
  );
}

export function useChatStatus() {
  const context = useContext(ChatStatusContext);
  if (!context) {
    throw new Error("useChatStatus must be used within ChatStatusProvider");
  }
  return context;
}

export function useChatOrb() {
  const context = useContext(ChatOrbContext);
  if (!context) {
    throw new Error("useChatOrb must be used within ChatOrbProvider");
  }
  return context;
}

export function useChatActions() {
  const context = useContext(ChatActionsContext);
  if (!context) {
    throw new Error("useChatActions must be used within ChatActionsProvider");
  }
  return context;
}

export function useChatView() {
  const context = useContext(ChatViewContext);
  if (!context) {
    throw new Error("useChatView must be used within ChatViewProvider");
  }
  return context;
}
