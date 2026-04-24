"use client"
import ChatSidebar from "@/components/chatbot"
import { useMolstar } from "@/hooks/useMolstar"
import { useViewerSocket } from "@/hooks/useViewerSocket"
import { useEffect, useRef } from "react"

export default function Page() {
  const parentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { handlers, state } = useMolstar(canvasRef, parentRef)

  useViewerSocket({
    sessionId: "user_1",
    onCommand: (cmd) => {
      switch (cmd.type) {
        case "CHANGE_COLOR":
          handlers.onChangeStructureColor(cmd.hexColor)
          break
        case "CHANGE_BG_COLOR":
          handlers.onChangeBackgroundColor(cmd.hexColor)
          break
        case "CHANGE_REPRESENTATION":
          handlers.onSetRepresentation(cmd.representation)
          break
        case "TOGGLE_SPIN":
          handlers.onToggleSpin()
          break
        case "RECENTER":
          handlers.onRecenterView()
          break
        case "CHANGE_VIEW_MODE":
          handlers.onViewModeChange(cmd.mode)
          break
        case "TOGGLE_STEREO":
          handlers.onToggleStereoView()
          break
        case "FOCUS_ATOM":
          handlers.onFocusAtom(cmd.atomNum)
          break
        case "CLEAR":
          handlers.onClear()
          break
        case "TOGGLE_FULLSCREEN":
          handlers.onFullScreenToggle()
          break
      }
    },
  })

  useEffect(() => {
    if (!state.isPluginReady) return // ← wait for plugin

    const fetchfile = async () => {
      const res = await fetch("/testdnapro_10ns.gro")
      const blob = await res.blob()
      const file = new File([blob], "testdnapro_10ns.gro", {
        type: "chemical/x-pdb",
      })
      handlers.onTopologyFileSelect(file)
    }
    fetchfile()
  }, [state.isPluginReady]) // ← depend on this
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
