import { useState } from "react"

type Role = "user" | "assistant"

interface Message {
  role: Role
  content: string
}

export const useModel = async () => {
  const [messages, setMessages] = useState<Message[]>([])
  const callLLm = async (inputMessage: string) => {
    try {
      const response = await fetch("http://localhost:5555/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputMessage }),
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
    }
  }
}
