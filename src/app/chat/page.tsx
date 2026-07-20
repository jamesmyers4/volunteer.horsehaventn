import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isLiveAlert } from "@/lib/alerts"
import { postChatMessage } from "./actions"

const SEVERITY_LABELS: Record<string, string> = { INFO: "Info", WARNING: "Warning", URGENT: "Urgent" }

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ channelId?: string }> }) {
  const volunteer = await requireVolunteer()
  const canSeeAdminChannel = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"

  // The ADMIN channel (CONTEXT.md §14's "admin/shift-leader" channel type) isn't listed or
  // readable by a plain Volunteer — BROADCAST and both SHIFT channels are open to everyone.
  const channels = await prisma.chatChannel.findMany({
    where: canSeeAdminChannel ? {} : { type: { not: "ADMIN" } },
    orderBy: [{ type: "asc" }, { shiftType: "asc" }]
  })

  const { channelId: channelIdParam } = await searchParams
  const activeChannel = channels.find((c) => c.id === channelIdParam) ?? channels.find((c) => c.type === "BROADCAST") ?? channels[0]

  const messages = activeChannel
    ? await prisma.chatMessage.findMany({
        where: { channelId: activeChannel.id },
        include: { sender: true },
        orderBy: { createdAt: "desc" },
        take: 50
      })
    : []

  const now = new Date()

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Chat</h1>
      <nav className="flex gap-3 text-sm">
        {channels.map((channel) => (
          <Link key={channel.id} href={`/chat?channelId=${channel.id}`} className={`underline ${activeChannel?.id === channel.id ? "font-semibold" : ""}`}>
            {channel.name}
          </Link>
        ))}
      </nav>

      {activeChannel ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{activeChannel.name}</h2>
            <ul className="flex max-w-2xl flex-col gap-2 text-sm">
              {messages.map((message) => (
                <li key={message.id} className="rounded border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{message.sender.name}</span>
                    <span>{message.createdAt.toLocaleString()}</span>
                    {message.pinned && isLiveAlert(message, now) && (
                      <span className="rounded bg-black px-1.5 py-0.5 text-white">
                        Pinned{message.severity ? ` · ${SEVERITY_LABELS[message.severity]}` : ""}
                      </span>
                    )}
                  </div>
                  <p>{message.body}</p>
                </li>
              ))}
            </ul>
            {messages.length === 0 && <p className="text-sm text-gray-500">No messages yet.</p>}
          </section>

          <form action={postChatMessage} className="flex w-full max-w-md flex-col gap-2 text-sm">
            <input type="hidden" name="channelId" value={activeChannel.id} />
            <textarea name="body" required placeholder="Message" className="rounded border px-2 py-1" />
            {volunteer.role === "ADMIN" && (
              <div className="flex flex-col gap-2 rounded border border-dashed p-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="pinned" />
                  Pin as alert banner
                </label>
                <select name="severity" defaultValue="INFO" className="rounded border px-2 py-1">
                  <option value="INFO">Info</option>
                  <option value="WARNING">Warning</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                  Expires at (optional — leave blank for a standing alert)
                  <input type="datetime-local" name="expiresAt" className="rounded border px-2 py-1" />
                </label>
              </div>
            )}
            <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
              Send
            </button>
          </form>
        </>
      ) : (
        <p className="text-sm text-gray-500">No channels configured yet.</p>
      )}
    </main>
  )
}
