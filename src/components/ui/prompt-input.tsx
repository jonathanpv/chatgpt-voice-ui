"use client"

import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

type PromptInputValueContextType = {
  isLoading: boolean
  value?: string
  onValueChange?: (value: string) => void
  maxHeight: number | string
  onSubmit?: () => void
  disabled?: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  clearSignal?: number
}

const PromptInputValueContext = createContext<PromptInputValueContextType>({
  isLoading: false,
  value: undefined,
  onValueChange: undefined,
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
  textareaRef: React.createRef<HTMLTextAreaElement>(),
  clearSignal: undefined,
})

const PromptInputDisabledContext = createContext<boolean>(false)

function usePromptInputValue() {
  return useContext(PromptInputValueContext)
}

function usePromptInputDisabled() {
  return useContext(PromptInputDisabledContext)
}

export type PromptInputProps = {
  isLoading?: boolean
  value?: string
  onValueChange?: (value: string) => void
  maxHeight?: number | string
  onSubmit?: () => void
  children: React.ReactNode
  className?: string
  disabled?: boolean
  clearSignal?: number
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
} & React.ComponentProps<"div">

function PromptInput({
  className,
  isLoading = false,
  maxHeight = 240,
  value,
  onValueChange,
  onSubmit,
  children,
  disabled = false,
  clearSignal,
  textareaRef: textareaRefProp,
  onClick,
  ...props
}: PromptInputProps) {
  const textareaRef = textareaRefProp ?? useRef<HTMLTextAreaElement>(null)

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!disabled) textareaRef.current?.focus()
    onClick?.(e)
  }

  return (
    <PromptInputDisabledContext.Provider value={disabled}>
      <PromptInputValueContext.Provider
        value={{
          isLoading,
          value,
          onValueChange,
          maxHeight,
          onSubmit,
          disabled,
          textareaRef,
          clearSignal,
        }}
      >
        <div
          onClick={handleClick}
          className={cn(
            "border-input bg-background cursor-text rounded-3xl border p-2 shadow-xs",
            disabled && "cursor-not-allowed opacity-60",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </PromptInputValueContext.Provider>
    </PromptInputDisabledContext.Provider>
  )
}

export type PromptInputTextareaProps = {
  disableAutosize?: boolean
} & React.ComponentProps<typeof Textarea>

function PromptInputTextarea({
  className,
  onKeyDown,
  disableAutosize = false,
  ...props
}: PromptInputTextareaProps) {
  const {
    value,
    onValueChange,
    maxHeight,
    onSubmit,
    disabled,
    textareaRef,
    clearSignal,
  } = usePromptInputValue()
  const [localValue, setLocalValue] = useState("")
  const isControlled = value !== undefined
  const currentValue = isControlled ? value : localValue

  const adjustHeight = (el: HTMLTextAreaElement | null) => {
    if (!el || disableAutosize) return

    el.style.height = "auto"

    if (typeof maxHeight === "number") {
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    } else {
      el.style.height = `min(${el.scrollHeight}px, ${maxHeight})`
    }
  }

  const handleRef = (el: HTMLTextAreaElement | null) => {
    textareaRef.current = el
    adjustHeight(el)
  }

  useLayoutEffect(() => {
    if (!textareaRef.current || disableAutosize) return

    const el = textareaRef.current
    el.style.height = "auto"

    if (typeof maxHeight === "number") {
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    } else {
      el.style.height = `min(${el.scrollHeight}px, ${maxHeight})`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue, maxHeight, disableAutosize])

  useLayoutEffect(() => {
    if (!textareaRef.current) return
    if (clearSignal === undefined) return
    if (isControlled) return

    const el = textareaRef.current
    setLocalValue("")
    el.value = ""
    adjustHeight(el)
  }, [clearSignal, isControlled])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    adjustHeight(e.target)
    if (!isControlled) {
      setLocalValue(e.target.value)
    }
    onValueChange?.(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit?.()
    }
    onKeyDown?.(e)
  }

  return (
    <Textarea
      ref={handleRef}
      value={currentValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={cn(
        "text-primary min-h-[44px] w-full resize-none border-none bg-transparent shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
        className
      )}
      rows={1}
      disabled={disabled}
      {...props}
    />
  )
}

export type PromptInputActionsProps = React.HTMLAttributes<HTMLDivElement>

function PromptInputActions({
  children,
  className,
  ...props
}: PromptInputActionsProps) {
  return (
    <div className={cn("flex items-center   gap-2", className)} {...props}>
      {children}
    </div>
  )
}

export type PromptInputActionProps = {
  className?: string
  tooltip: React.ReactNode
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  allowWhenDisabled?: boolean
} & React.ComponentProps<typeof Tooltip>

function PromptInputAction({
  tooltip,
  children,
  className,
  side = "top",
  allowWhenDisabled = false,
  ...props
}: PromptInputActionProps) {
  const disabled = usePromptInputDisabled()
  const isDisabled = allowWhenDisabled ? false : disabled

  return (
    <Tooltip {...props}>
      <TooltipTrigger
        asChild
        disabled={isDisabled}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
}
