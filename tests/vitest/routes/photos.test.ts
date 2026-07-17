import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const sendMock = vi.hoisted(() => vi.fn(async () => ({})))

vi.mock("@/lib/r2", () => ({
  r2: { send: sendMock },
  R2_BUCKET_NAME: "test-bucket",
  R2_PUBLIC_URL: "https://test-bucket.example.com"
}))

import { POST } from "@/app/api/horses/[id]/photos/route"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs, mockSignedOut } from "../helpers/auth-mock"
import { createHorse, createVolunteer } from "../helpers/factories"

function buildRequest(fields: { file?: File; type?: string; isPrimary?: boolean }) {
  const fd = new FormData()
  if (fields.file) fd.set("file", fields.file)
  if (fields.type) fd.set("type", fields.type)
  if (fields.isPrimary) fd.set("isPrimary", "on")
  return {
    url: "http://localhost:3000",
    formData: async () => fd
  } as unknown as NextRequest
}

function imageFile(name = "photo.jpg") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" })
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("POST /api/horses/[id]/photos", () => {
  beforeEach(() => {
    sendMock.mockClear()
  })

  it("requires authentication", async () => {
    mockSignedOut()
    const horse = await createHorse()
    await expect(POST(buildRequest({ file: imageFile(), type: "PROFILE" }), paramsFor(horse.id))).rejects.toThrow("Not authenticated")
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("rejects when no file is provided", async () => {
    await createVolunteer({ clerkId: "clerk_photo_1" })
    mockSignedInAs("clerk_photo_1")
    const horse = await createHorse()

    const res = await POST(buildRequest({ type: "PROFILE" }), paramsFor(horse.id))
    expect(res.status).toBe(400)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("rejects a non-image file", async () => {
    await createVolunteer({ clerkId: "clerk_photo_2" })
    mockSignedInAs("clerk_photo_2")
    const horse = await createHorse()
    const pdf = new File([new Uint8Array([1])], "manual.pdf", { type: "application/pdf" })

    const res = await POST(buildRequest({ file: pdf, type: "OTHER" }), paramsFor(horse.id))
    expect(res.status).toBe(400)
    expect(await prisma.horsePhoto.count()).toBe(0)
  })

  it("uploads a valid image, records the HorsePhoto row, and redirects to the horse page", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_photo_3" })
    mockSignedInAs("clerk_photo_3")
    const horse = await createHorse()

    const res = await POST(buildRequest({ file: imageFile("profile.jpg"), type: "PROFILE" }), paramsFor(horse.id))

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toContain(`/horses/${horse.id}`)

    const photo = await prisma.horsePhoto.findFirstOrThrow({ where: { horseId: horse.id } })
    expect(photo.type).toBe("PROFILE")
    expect(photo.uploadedBy).toBe(volunteer.id)
    expect(photo.url.startsWith(`https://test-bucket.example.com/horses/${horse.id}/`)).toBe(true)
  })

  it("sanitizes unsafe characters out of the uploaded file name for the storage key", async () => {
    await createVolunteer({ clerkId: "clerk_photo_4" })
    mockSignedInAs("clerk_photo_4")
    const horse = await createHorse()

    await POST(buildRequest({ file: imageFile("weird name (1)!.jpg"), type: "OTHER" }), paramsFor(horse.id))

    const photo = await prisma.horsePhoto.findFirstOrThrow({ where: { horseId: horse.id } })
    expect(photo.url).not.toMatch(/[()! ]/)
  })

  it("unsets isPrimary on other photos of the same type before creating the new primary one", async () => {
    await createVolunteer({ clerkId: "clerk_photo_5" })
    mockSignedInAs("clerk_photo_5")
    const horse = await createHorse()
    const existing = await prisma.horsePhoto.create({
      data: { horseId: horse.id, url: "https://test-bucket.example.com/existing.jpg", type: "PROFILE", isPrimary: true }
    })

    await POST(buildRequest({ file: imageFile("new-headshot.jpg"), type: "PROFILE", isPrimary: true }), paramsFor(horse.id))

    const previous = await prisma.horsePhoto.findUniqueOrThrow({ where: { id: existing.id } })
    expect(previous.isPrimary).toBe(false)

    const primaries = await prisma.horsePhoto.findMany({ where: { horseId: horse.id, type: "PROFILE", isPrimary: true } })
    expect(primaries).toHaveLength(1)
  })

  it("does not touch isPrimary flags on other photo types", async () => {
    await createVolunteer({ clerkId: "clerk_photo_6" })
    mockSignedInAs("clerk_photo_6")
    const horse = await createHorse()
    const mapPhoto = await prisma.horsePhoto.create({
      data: { horseId: horse.id, url: "https://test-bucket.example.com/map.jpg", type: "MAP", isPrimary: true }
    })

    await POST(buildRequest({ file: imageFile("headshot.jpg"), type: "PROFILE", isPrimary: true }), paramsFor(horse.id))

    const stillPrimary = await prisma.horsePhoto.findUniqueOrThrow({ where: { id: mapPhoto.id } })
    expect(stillPrimary.isPrimary).toBe(true)
  })

  it("leaves ChangeLog untouched — HorsePhoto is deliberately not a tracked model", async () => {
    await createVolunteer({ clerkId: "clerk_photo_7" })
    mockSignedInAs("clerk_photo_7")
    const horse = await createHorse()
    const before = await prisma.changeLog.count()

    await POST(buildRequest({ file: imageFile(), type: "OTHER" }), paramsFor(horse.id))

    expect(await prisma.changeLog.count()).toBe(before)
  })
})
