import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const sendMock = vi.hoisted(() => vi.fn(async () => ({})))

vi.mock("@/lib/r2", () => ({
  r2: { send: sendMock },
  R2_BUCKET_NAME: "test-bucket",
  R2_PUBLIC_URL: "https://test-bucket.example.com"
}))

import { POST } from "@/app/api/animals/[id]/photos/route"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs, mockSignedOut } from "../helpers/auth-mock"
import { createAnimal, createVolunteer } from "../helpers/factories"

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

describe("POST /api/animals/[id]/photos", () => {
  beforeEach(() => {
    sendMock.mockClear()
  })

  it("requires authentication", async () => {
    mockSignedOut()
    const animal = await createAnimal()
    await expect(POST(buildRequest({ file: imageFile(), type: "PROFILE" }), paramsFor(animal.id))).rejects.toThrow("Not authenticated")
    expect(sendMock).not.toHaveBeenCalled()
  })

  // V4.md Session 1: KIOSK is a shared, read-only display account — this route used to gate
  // only on requireVolunteer() ("any signed-in person"), the same self-service gap several
  // other actions had.
  it("rejects a KIOSK-role account and never touches R2", async () => {
    await createVolunteer({ clerkId: "clerk_photo_kiosk", role: "KIOSK" })
    mockSignedInAs("clerk_photo_kiosk")
    const animal = await createAnimal()

    await expect(POST(buildRequest({ file: imageFile(), type: "PROFILE" }), paramsFor(animal.id))).rejects.toThrow("Not authorized")
    expect(sendMock).not.toHaveBeenCalled()
    expect(await prisma.animalPhoto.count()).toBe(0)
  })

  it("rejects when no file is provided", async () => {
    await createVolunteer({ clerkId: "clerk_photo_1" })
    mockSignedInAs("clerk_photo_1")
    const animal = await createAnimal()

    const res = await POST(buildRequest({ type: "PROFILE" }), paramsFor(animal.id))
    expect(res.status).toBe(400)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("rejects a non-image file", async () => {
    await createVolunteer({ clerkId: "clerk_photo_2" })
    mockSignedInAs("clerk_photo_2")
    const animal = await createAnimal()
    const pdf = new File([new Uint8Array([1])], "manual.pdf", { type: "application/pdf" })

    const res = await POST(buildRequest({ file: pdf, type: "OTHER" }), paramsFor(animal.id))
    expect(res.status).toBe(400)
    expect(await prisma.animalPhoto.count()).toBe(0)
  })

  it("uploads a valid image, records the AnimalPhoto row, and redirects to the animal page", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_photo_3" })
    mockSignedInAs("clerk_photo_3")
    const animal = await createAnimal()

    const res = await POST(buildRequest({ file: imageFile("profile.jpg"), type: "PROFILE" }), paramsFor(animal.id))

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toContain(`/animals/${animal.id}`)

    const photo = await prisma.animalPhoto.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(photo.type).toBe("PROFILE")
    expect(photo.uploadedBy).toBe(volunteer.id)
    expect(photo.url.startsWith(`https://test-bucket.example.com/animals/${animal.id}/`)).toBe(true)
  })

  it("sanitizes unsafe characters out of the uploaded file name for the storage key", async () => {
    await createVolunteer({ clerkId: "clerk_photo_4" })
    mockSignedInAs("clerk_photo_4")
    const animal = await createAnimal()

    await POST(buildRequest({ file: imageFile("weird name (1)!.jpg"), type: "OTHER" }), paramsFor(animal.id))

    const photo = await prisma.animalPhoto.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(photo.url).not.toMatch(/[()! ]/)
  })

  it("unsets isPrimary on other photos of the same type before creating the new primary one", async () => {
    await createVolunteer({ clerkId: "clerk_photo_5" })
    mockSignedInAs("clerk_photo_5")
    const animal = await createAnimal()
    const existing = await prisma.animalPhoto.create({
      data: { animalId: animal.id, url: "https://test-bucket.example.com/existing.jpg", type: "PROFILE", isPrimary: true }
    })

    await POST(buildRequest({ file: imageFile("new-headshot.jpg"), type: "PROFILE", isPrimary: true }), paramsFor(animal.id))

    const previous = await prisma.animalPhoto.findUniqueOrThrow({ where: { id: existing.id } })
    expect(previous.isPrimary).toBe(false)

    const primaries = await prisma.animalPhoto.findMany({ where: { animalId: animal.id, type: "PROFILE", isPrimary: true } })
    expect(primaries).toHaveLength(1)
  })

  it("does not touch isPrimary flags on other photo types", async () => {
    await createVolunteer({ clerkId: "clerk_photo_6" })
    mockSignedInAs("clerk_photo_6")
    const animal = await createAnimal()
    const mapPhoto = await prisma.animalPhoto.create({
      data: { animalId: animal.id, url: "https://test-bucket.example.com/map.jpg", type: "MAP", isPrimary: true }
    })

    await POST(buildRequest({ file: imageFile("headshot.jpg"), type: "PROFILE", isPrimary: true }), paramsFor(animal.id))

    const stillPrimary = await prisma.animalPhoto.findUniqueOrThrow({ where: { id: mapPhoto.id } })
    expect(stillPrimary.isPrimary).toBe(true)
  })

  it("leaves ChangeLog untouched — AnimalPhoto is deliberately not a tracked model", async () => {
    await createVolunteer({ clerkId: "clerk_photo_7" })
    mockSignedInAs("clerk_photo_7")
    const animal = await createAnimal()
    const before = await prisma.changeLog.count()

    await POST(buildRequest({ file: imageFile(), type: "OTHER" }), paramsFor(animal.id))

    expect(await prisma.changeLog.count()).toBe(before)
  })
})
