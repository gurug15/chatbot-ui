"use client"
import ChatSidebar from "@/components/chatbot"
import { useMolstar } from "@/hooks/useMolstar"
import { useRef } from "react"

export default function Page() {
  const parentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const {} = useMolstar(canvasRef, parentRef)
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Left: main content area (4/5) ─────────────────────────── */}
      <div ref={parentRef} className="flex flex-1 flex-col overflow-y-auto">
        <canvas
          ref={canvasRef}
          // className="w-full flex-1 rounded-lg border bg-white"
        />
      </div>

      {/* ── Right: chat sidebar (1/5) ──────────────────────────────── */}
      <div className="w-1/5 min-w-[240px] shrink-0">
        <ChatSidebar />
      </div>
    </div>
  )
}
