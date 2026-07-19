"use client"

import { useEffect, useRef, useState } from "react"

// V2.md Session 6: "enforce a square crop at upload time (client-side crop step before the
// image goes to R2), not server-side resizing after the fact" — the Feed Board's headshot
// column depends on every PROFILE photo being a consistent square. This is the first client
// component in the codebase (everything else is zero-"use client", per CLAUDE.md's stated
// convention) — a deliberate, spec-required exception, deliberately scoped narrowly to just
// this crop step rather than converting the whole Photos section to client-rendered.
//
// The output canvas (CROP_SIZE x CROP_SIZE) both renders the live preview and is the exact
// source for the uploaded blob, so what the volunteer sees is exactly what gets stored — no
// separate higher-res recompute step to keep in sync. 320px is comfortably above every place
// this app currently displays a headshot (64px on the Feed Board, 128px on the animal detail
// page), so it isn't a resolution bottleneck for this app's actual use.
const CROP_SIZE = 320

export function HeadshotCropUpload({ animalId }: { animalId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [hasImage, setHasImage] = useState(false)
  const [naturalWidth, setNaturalWidth] = useState(0)
  const [naturalHeight, setNaturalHeight] = useState(0)
  // 0-100: position along whichever axis has extra image to pan through, after the image is
  // scaled to cover the square (matches CSS object-fit: cover, but with a movable window
  // instead of always-centered). 50 = centered, the default.
  const [panX, setPanX] = useState(50)
  const [panY, setPanY] = useState(50)
  const [isPrimary, setIsPrimary] = useState(true)
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !hasImage) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const scale = CROP_SIZE / Math.min(naturalWidth, naturalHeight)
    const scaledWidth = naturalWidth * scale
    const scaledHeight = naturalHeight * scale
    const maxOffsetX = Math.max(0, scaledWidth - CROP_SIZE)
    const maxOffsetY = Math.max(0, scaledHeight - CROP_SIZE)
    const drawX = -(maxOffsetX * (panX / 100))
    const drawY = -(maxOffsetY * (panY / 100))

    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE)
    ctx.drawImage(img, drawX, drawY, scaledWidth, scaledHeight)
  }, [panX, panY, hasImage, naturalWidth, naturalHeight])

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setStatus("idle")
    setErrorMessage("")
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setNaturalWidth(img.naturalWidth)
      setNaturalHeight(img.naturalHeight)
      setPanX(50)
      setPanY(50)
      setHasImage(true)
      URL.revokeObjectURL(objectUrl)
    }
    img.src = objectUrl
  }

  function onSubmit() {
    const canvas = canvasRef.current
    if (!canvas) return
    setStatus("uploading")
    setErrorMessage("")
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setStatus("error")
          setErrorMessage("Could not process the image — try a different photo.")
          return
        }
        const formData = new FormData()
        formData.set("file", new File([blob], "headshot.jpg", { type: "image/jpeg" }))
        formData.set("type", "PROFILE")
        if (isPrimary) formData.set("isPrimary", "on")
        try {
          const res = await fetch(`/api/animals/${animalId}/photos`, { method: "POST", body: formData })
          if (!res.ok) throw new Error(`Upload failed (${res.status})`)
          window.location.href = res.url
        } catch (error) {
          setStatus("error")
          setErrorMessage(error instanceof Error ? error.message : "Upload failed.")
        }
      },
      "image/jpeg",
      0.9
    )
  }

  const canPanX = hasImage && naturalWidth / naturalHeight > 1
  const canPanY = hasImage && naturalHeight / naturalWidth > 1

  return (
    <div className="flex flex-col gap-2 rounded border p-3 text-sm">
      <h3 className="text-xs font-semibold text-gray-500">Add headshot (auto square-cropped)</h3>
      <input type="file" accept="image/*" aria-label="Headshot photo file" onChange={onFileChange} />
      {hasImage && (
        <>
          <canvas ref={canvasRef} width={CROP_SIZE} height={CROP_SIZE} className="rounded border" aria-label="Headshot crop preview" />
          {canPanX && (
            <label className="flex flex-col gap-1 text-xs">
              Horizontal position
              <input type="range" min={0} max={100} value={panX} onChange={(e) => setPanX(Number(e.target.value))} />
            </label>
          )}
          {canPanY && (
            <label className="flex flex-col gap-1 text-xs">
              Vertical position
              <input type="range" min={0} max={100} value={panY} onChange={(e) => setPanY(Number(e.target.value))} />
            </label>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
            Set as primary headshot
          </label>
          <button
            type="button"
            onClick={onSubmit}
            disabled={status === "uploading"}
            className="w-fit rounded border px-4 py-2 text-xs disabled:opacity-50"
          >
            {status === "uploading" ? "Uploading…" : "Use this headshot"}
          </button>
          {status === "error" && <p className="text-xs text-red-700">{errorMessage}</p>}
        </>
      )}
    </div>
  )
}
