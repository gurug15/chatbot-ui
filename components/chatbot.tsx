"use client"

import { useState, useRef, useEffect, KeyboardEvent } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { SendHorizonal, Bot, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"

// ── Types ────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant"

interface Message {
  role: Role
  content: string
}

// ── Code block renderer ───────────────────────────────────────────────────────

interface CodeProps {
  inline?: boolean
  className?: string
  children?: React.ReactNode
}

function CodeBlock({ inline, className, children }: CodeProps) {
  const language = className?.split("-")[1] ?? "text"
  const code = String(children).replace(/\n$/, "")

  if (inline) {
    return (
      <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs">
        {children}
      </code>
    )
  }

  return (
    <SyntaxHighlighter
      language={language}
      style={oneDark}
      PreTag="div"
      wrapLongLines={false}
      customStyle={{
        borderRadius: "6px",
        fontSize: "12px",
        maxWidth: "100%",
        overflowX: "auto",
        margin: "6px 0",
      }}
    >
      {code}
    </SyntaxHighlighter>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"

  return (
    <div
      className={cn(
        "flex items-start gap-2 py-2",
        isUser && "flex-row-reverse"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      <div
        className={cn(
          "max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm bg-muted text-foreground"
        )}
      >
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            div: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
            // Route all code through CodeBlock — it handles inline vs block
            code: ({ node, inline, className, children, ...props }: any) => (
              <CodeBlock inline={inline} className={className}>
                {children}
              </CodeBlock>
            ),
            // pre must NOT add overflow or it fights with SyntaxHighlighter
            pre: ({ children }) => <>{children}</>,
          }}
        >
          {message.content}
        </Markdown>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatSidebar() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState<string>("")
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setInput("")
    setIsLoading(true)
    setMessages((prev) => [...prev, { role: "user", content: trimmed }])
    setMessages((prev) => [...prev, { role: "assistant", content: "" }])

    try {
      const response = await fetch("http://localhost:5555/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder("utf-8")
      let accumulated = ""
      let done = false

      while (!done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading
        accumulated += decoder.decode(value ?? new Uint8Array())

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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex h-screen w-full flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-primary" />
          <span className="text-sm font-semibold tracking-tight">
            Assistant
          </span>
        </div>
        <Badge variant="outline" className="text-xs font-normal">
          {isLoading ? "Typing…" : "Online"}
        </Badge>
      </div>

      <Separator />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Bot size={32} strokeWidth={1.5} />
            <p className="text-sm">Ask me anything.</p>
          </div>
        ) : (
          <div className="py-3">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
            {isLoading && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-1 py-2 pl-9">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <Separator />

      {/* Input row */}
      <div className="flex items-center gap-2 p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          disabled={isLoading}
          className="h-9 text-sm"
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={!input.trim() || isLoading}
          onClick={() => sendMessage(input)}
        >
          <SendHorizonal size={15} />
        </Button>
      </div>
    </div>
  )
}
