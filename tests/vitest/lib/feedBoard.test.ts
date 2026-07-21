import { describe, it, expect } from "vitest"
import { resolveFeedBoardShift, resolveDisplayedFeedBoardShift } from "@/lib/feedBoard"

describe("resolveFeedBoardShift", () => {
  it("returns AM before noon", () => {
    expect(resolveFeedBoardShift(new Date("2026-07-20T00:00:00"))).toBe("AM")
    expect(resolveFeedBoardShift(new Date("2026-07-20T11:59:59"))).toBe("AM")
  })

  it("returns PM at exactly noon and after", () => {
    expect(resolveFeedBoardShift(new Date("2026-07-20T12:00:00"))).toBe("PM")
    expect(resolveFeedBoardShift(new Date("2026-07-20T23:59:59"))).toBe("PM")
  })
})

describe("resolveDisplayedFeedBoardShift", () => {
  it("falls back to the automatic noon-boundary value when no override is given", () => {
    expect(resolveDisplayedFeedBoardShift(undefined, new Date("2026-07-20T08:00:00"))).toBe("AM")
    expect(resolveDisplayedFeedBoardShift(undefined, new Date("2026-07-20T15:00:00"))).toBe("PM")
  })

  it("an explicit AM override wins even in the afternoon", () => {
    expect(resolveDisplayedFeedBoardShift("AM", new Date("2026-07-20T15:00:00"))).toBe("AM")
  })

  it("an explicit PM override wins even in the morning", () => {
    expect(resolveDisplayedFeedBoardShift("PM", new Date("2026-07-20T08:00:00"))).toBe("PM")
  })

  it("ignores a malformed override and falls back to the automatic value", () => {
    expect(resolveDisplayedFeedBoardShift("bogus", new Date("2026-07-20T08:00:00"))).toBe("AM")
    expect(resolveDisplayedFeedBoardShift("", new Date("2026-07-20T15:00:00"))).toBe("PM")
  })
})
