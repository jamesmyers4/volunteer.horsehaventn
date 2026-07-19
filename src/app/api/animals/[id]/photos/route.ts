import { PutObjectCommand } from "@aws-sdk/client-s3"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { r2, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const volunteer = await requireVolunteer()
  const { id: animalId } = await context.params

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const type = String(formData.get("type") || "OTHER")
  const isPrimary = formData.get("isPrimary") === "on"

  if (!file || !file.type.startsWith("image/")) {
    return new Response("A valid image file is required", { status: 400 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
  const key = `animals/${animalId}/${Date.now()}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type
    })
  )

  const url = `${R2_PUBLIC_URL}/${key}`

  if (isPrimary) {
    await prisma.animalPhoto.updateMany({ where: { animalId, type, isPrimary: true }, data: { isPrimary: false } })
  }

  await prisma.animalPhoto.create({
    data: { animalId, url, type, isPrimary, takenAt: new Date(), uploadedBy: volunteer.id }
  })

  return NextResponse.redirect(new URL(`/animals/${animalId}`, req.url), { status: 303 })
}
