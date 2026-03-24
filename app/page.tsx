import ChatSidebar from "@/components/chatbot"

export default function Page() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* ── Left: main content area (4/5) ─────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-y-auto p-8">
        {/* Replace everything below with whatever you want */}
        <h1 className="text-3xl font-bold tracking-tight">Your App</h1>
        <p className="mt-2 text-muted-foreground">
          Put anything you want here — dashboards, docs, tables, forms…
        </p>
      </main>

      {/* ── Right: chat sidebar (1/5) ──────────────────────────────── */}
      <div className="w-1/5 min-w-[240px] shrink-0">
        <ChatSidebar />
      </div>
    </div>
  )
}
