import { useEffect, useRef } from "react"

export type ViewerCommand =
  | { type: "CHANGE_COLOR"; hexColor: string }

interface UseViewerSocketOptions {
  sessionId: string
  onCommand: (cmd: ViewerCommand) => void
}

export function useViewerSocket({ sessionId, onCommand }: UseViewerSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)

  // Keep onCommand stable across renders without closing/reopening the socket
  const onCommandRef = useRef(onCommand)
  useEffect(() => { onCommandRef.current = onCommand }, [onCommand])

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:5555/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
  console.log("[ViewerSocket] connected")
  // @ts-ignore
  window.__viewerWs = ws  // remove this after testing
}

   ws.onmessage = (event) => {
  console.log("[ViewerSocket] raw message:", event.data)  // add this
  try {
    const msg = JSON.parse(event.data)
    console.log("[ViewerSocket] parsed:", msg)  // add this
    if (msg.type === "VIEWER_CMD") {
      onCommandRef.current(msg.payload as ViewerCommand)
    }
  } catch (e) {
    console.error("[ViewerSocket] parse error", e)
  }
}

    ws.onerror = (e) => console.error("[ViewerSocket] error", e)
    ws.onclose = () => console.log("[ViewerSocket] closed")

    return () => ws.close()
  }, [sessionId]) // only reconnects if sessionId changes

  const pushViewerState = (payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "VIEWER_STATE", payload }))
    }
  }

  return { pushViewerState }
}