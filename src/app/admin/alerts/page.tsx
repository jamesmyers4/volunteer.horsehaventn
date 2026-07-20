import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isLiveAlert } from "@/lib/alerts"
import { postChatMessage } from "@/app/chat/actions"

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function AdminAlertsPage() {
  const authorized = await checkAccess()

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">Composing a pinned alert requires an ADMIN-role account.</p>
      </main>
    )
  }

  // Target BROADCAST or a specific SHIFT channel only (V3.md Session 7's own scope) — the
  // ADMIN channel is never a banner source at all (src/lib/alerts.ts's isAlertVisibleForViewer
  // returns false for it), so it's left out of this composer's choices even though it's still
  // reachable directly from /chat.
  const channels = await prisma.chatChannel.findMany({
    where: { type: { in: ["BROADCAST", "SHIFT"] } },
    orderBy: [{ type: "asc" }, { shiftType: "asc" }]
  })

  const now = new Date()
  const pinnedMessages = await prisma.chatMessage.findMany({
    where: { pinned: true, channelId: { in: channels.map((c) => c.id) } },
    include: { channel: true, sender: true },
    orderBy: { createdAt: "desc" }
  })
  const liveAlerts = pinnedMessages.filter((message) => isLiveAlert(message, now))

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Pinned Alerts</h1>
      <p className="text-sm text-gray-500">
        Post a pinned banner alert to every authenticated view (Farm-Wide Announcements) or to just one shift&apos;s channel. No separate
        Alert table — this posts the same pinned chat message the composer on the channel&apos;s own{" "}
        <a href="/chat" className="underline">
          /chat
        </a>{" "}
        page does, without needing to navigate into that channel first.
      </p>

      <form action={postChatMessage} className="flex w-full max-w-md flex-col gap-2 text-sm">
        <input type="hidden" name="pinned" value="on" />
        <label className="flex flex-col gap-1">
          Channel
          <select name="channelId" required className="rounded border px-2 py-1">
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Message
          <textarea name="body" required placeholder="Alert message" className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Severity
          <select name="severity" defaultValue="INFO" className="rounded border px-2 py-1">
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Expires at (optional — leave blank for a standing alert)
          <input type="datetime-local" name="expiresAt" className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
          Post pinned alert
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Currently live</h2>
        <ul className="flex max-w-md flex-col gap-2 text-sm">
          {liveAlerts.map((message) => (
            <li key={message.id} className="rounded border px-3 py-2">
              <div className="text-xs text-gray-500">
                {message.channel.name} · {message.severity ?? "INFO"} · {message.sender.name}
              </div>
              <p>{message.body}</p>
            </li>
          ))}
        </ul>
        {liveAlerts.length === 0 && <p className="text-sm text-gray-500">No live pinned alerts right now.</p>}
      </section>
    </main>
  )
}
