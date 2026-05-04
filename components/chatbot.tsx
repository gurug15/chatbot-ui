"use client"

import { useState, useRef, useEffect, KeyboardEvent } from "react"
import { SendHorizonal, Bot, User, AlertTriangle, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import { AnalysisDialog } from "./AnalysisDialog"

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant"

interface Message {
  role: Role
  content: string
  isInterrupt?: boolean
  interruptQuestion?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = "http://localhost:5555"
const INTERRUPT_SENTINEL = /^([\s\S]*?)\n\n\[INTERRUPT\]: (.+)$/

// ── Interrupt approval card ───────────────────────────────────────────────────

interface InterruptCardProps {
  question: string
  onDecide: (decision: "yes" | "no") => void
  disabled: boolean
}

function InterruptCard({ question, onDecide, disabled }: InterruptCardProps) {
  return (
    <div className="max-w-[85%] rounded-xl border border-l-4 border-amber-200 border-l-amber-400 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:border-l-amber-500 dark:bg-amber-950/30">
      <div className="mb-2 flex items-center gap-1.5">
        <AlertTriangle
          size={12}
          className="text-amber-600 dark:text-amber-400"
        />
        <span className="text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
          Approval Required
        </span>
      </div>
      <p className="mb-3 leading-relaxed text-foreground">{question}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onDecide("yes")}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check size={12} />
          Approve
        </button>
        <button
          onClick={() => onDecide("no")}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={12} />
          Decline
        </button>
      </div>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 py-1">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot size={14} />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-3 py-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message
  onDecide?: (decision: "yes" | "no") => void
  interruptDisabled?: boolean
}

function MessageBubble({
  message,
  onDecide,
  interruptDisabled,
}: MessageBubbleProps) {
  const isUser = message.role === "user"

  if (message.isInterrupt) {
    return (
      <div className="flex items-end gap-2 py-1">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Bot size={14} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {message.content && (
            <div className="max-w-[85vw] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm leading-relaxed wrap-break-word text-foreground sm:max-w-[75%]">
              {message.content}
            </div>
          )}
          <InterruptCard
            question={message.interruptQuestion ?? ""}
            onDecide={onDecide ?? (() => {})}
            disabled={interruptDisabled ?? false}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn("flex items-end gap-2 py-1", isUser && "flex-row-reverse")}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      <div
        className={cn(
          // Responsive max-width: tighter on mobile, wider on desktop
          "max-w-[80vw] min-w-0 sm:max-w-[70%] lg:max-w-[60%]",
          "wrap-break-words rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "rounded-tr-sm bg-blue-600 text-white"
            : "rounded-tl-sm bg-muted text-foreground"
        )}
      >
        {message.content || (
          <span className="italic opacity-40">thinking…</span>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatSidebar() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [awaitingInterrupt, setAwaitingInterrupt] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Core streaming helper ──────────────────────────────────────────────────

  const streamRequest = async (
    endpoint: string,
    body: Record<string, string>
  ): Promise<void> => {
    setIsLoading(true)

    // Placeholder assistant bubble that we'll fill as chunks arrive
    setMessages((prev) => [...prev, { role: "assistant", content: "" }])

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.body) throw new Error("No response body")

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let accumulated = ""
      let done = false

      while (!done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading
        accumulated += decoder.decode(value ?? new Uint8Array())

        // ── Detect interrupt sentinel ──────────────────────────────────────
        const match = accumulated.match(INTERRUPT_SENTINEL)
        if (match) {
          const beforeText = match[1].trim()
          const question = match[2].trim()

          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = {
              role: "assistant",
              content: beforeText,
              isInterrupt: true,
              interruptQuestion: question,
            }
            return updated
          })

          setAwaitingInterrupt(true)
          setIsLoading(false)
          return
        }

        // ── Normal streaming chunk ─────────────────────────────────────────
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            content: accumulated,
          }
          return updated
        })
      }
    } catch (err) {
      console.error("Chat error:", err)
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        }
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }

  // ── Send new user message ──────────────────────────────────────────────────

  const sendMessage = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed || isLoading || awaitingInterrupt) return

    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: trimmed }])
    await streamRequest("/chat", { message: trimmed })
  }

  // ── Resume after interrupt ─────────────────────────────────────────────────

  const handleInterruptDecision = async (
    decision: "yes" | "no"
  ): Promise<void> => {
    // Replace the interrupt card message with a settled state
    setMessages((prev) => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.isInterrupt) {
        updated[updated.length - 1] = {
          ...last,
          isInterrupt: false,
          interruptQuestion: undefined,
        }
      }
      return updated
    })

    setAwaitingInterrupt(false)

    // Show user's decision as a message
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: decision === "yes" ? "Approved ✓" : "Declined ✗",
      },
    ])

    await streamRequest("/chat/resume", { decision })
  }

  // ── Keyboard handler ───────────────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  useEffect(() => {
    if (!isLoading && !awaitingInterrupt) {
      inputRef.current?.focus()
    }
  }, [isLoading, awaitingInterrupt])

  // ── Render ─────────────────────────────────────────────────────────────────

  const inputBlocked = isLoading || awaitingInterrupt

  return (
    <div className="flex h-svh w-full flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-blue-600" />
          <span className="text-sm font-medium">Assistant</span>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs",
            isLoading
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
              : awaitingInterrupt
                ? "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400"
                : "border-border text-muted-foreground"
          )}
        >
          {isLoading
            ? "Typing…"
            : awaitingInterrupt
              ? "Awaiting approval"
              : "Online"}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 sm:px-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Bot size={28} strokeWidth={1.5} />
            <p className="text-sm">Ask me anything.</p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                onDecide={handleInterruptDecision}
                interruptDisabled={isLoading}
              />
            ))}
            {isLoading && messages[messages.length - 1]?.content === "" && (
              <TypingIndicator />
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Interrupt notice banner */}
      {awaitingInterrupt && (
        <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
          Respond to the approval request above before sending a new message.
        </div>
      )}

      {/* Input row */}
      <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2.5 sm:px-4">
        <input
          value={input}
          ref={inputRef}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={awaitingInterrupt ? "Waiting for approval…" : "Message…"}
          disabled={inputBlocked}
          className={cn(
            "min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm text-foreground",
            "outline-none placeholder:text-muted-foreground",
            "focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
            "transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
        <button
          disabled={!input.trim() || inputBlocked}
          onClick={() => sendMessage(input)}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
            "disabled:cursor-not-allowed disabled:opacity-40",
            "hover:bg-muted enabled:active:scale-95"
          )}
        >
          <SendHorizonal size={15} />
        </button>
        <AnalysisDialog />
      </div>
    </div>
  )
}
