"use client";

import { Camera, Check, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type UploadedPhoto = { id: string; name: string; previewUrl: string };

async function normalizePhoto(file: File): Promise<File> {
  if (file.type !== "image/heic" && file.type !== "image/heif") return file;
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    image.src = sourceUrl;
    await image.decode();
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo conversion is unavailable on this device.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!jpeg) throw new Error("Photo conversion is unavailable on this device.");
    return new File([jpeg], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    throw new Error("This HEIC photo could not be prepared. Take a new photo or choose a JPEG, PNG, or WebP image.");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function PhotoUpload({
  value,
  maxBytes,
  onChange,
  onUploadingChange,
}: {
  value: UploadedPhoto[];
  maxBytes: number;
  onChange: (photos: UploadedPhoto[]) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const ownedPreviewUrls = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => () => {
    for (const previewUrl of ownedPreviewUrls.current) URL.revokeObjectURL(previewUrl);
  }, []);

  async function upload(file: File) {
    setError(null);
    if (file.size <= 0) {
      setError("The selected photo is empty.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`The photo must be smaller than ${Math.floor(maxBytes / 1_048_576)} MB.`);
      return;
    }
    setUploading(true);
    onUploadingChange(true);
    let previewUrl: string | null = null;
    try {
      const uploadFile = await normalizePhoto(file);
      if (uploadFile.size > maxBytes) throw new Error(`The prepared photo must be smaller than ${Math.floor(maxBytes / 1_048_576)} MB.`);
      previewUrl = URL.createObjectURL(uploadFile);
      ownedPreviewUrls.current.add(previewUrl);
      const body = new FormData();
      body.append("file", uploadFile);
      const response = await fetch("/api/uploads", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(60_000),
      });
      const responseText = await response.text();
      let result: { id?: string; name?: string; error?: string } = {};
      try { result = responseText ? JSON.parse(responseText) as typeof result : {}; } catch {
        throw new Error(`Photo upload failed (${response.status}). Try again.`);
      }
      if (!response.ok || !result.id) throw new Error(result.error ?? "Photo upload failed.");
      onChange([...value, { id: result.id, name: result.name ?? uploadFile.name, previewUrl }]);
    } catch (uploadError) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        ownedPreviewUrls.current.delete(previewUrl);
      }
      const message = uploadError instanceof Error ? uploadError.message : "Photo upload failed.";
      setError(message === "Load failed" || message === "Failed to fetch" || uploadError instanceof DOMException
        ? "The photo could not reach the server. Check the connection and try again."
        : message);
    } finally {
      setUploading(false);
      onUploadingChange(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (libraryInputRef.current) libraryInputRef.current.value = "";
    }
  }

  return (
    <div className="photo-upload">
      <input
        ref={cameraInputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <input
        ref={libraryInputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="photo-upload-actions">
        <button className="photo-button" type="button" disabled={uploading || value.length >= 5} onClick={() => cameraInputRef.current?.click()}>
          {uploading ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />}
          {uploading ? "Uploading…" : "Take photo"}
        </button>
        <button className="photo-button photo-button-secondary" type="button" disabled={uploading || value.length >= 5} onClick={() => libraryInputRef.current?.click()}>
          <ImagePlus size={17} /> Choose photo
        </button>
      </div>
      {value.length ? (
        <div className="photo-preview-list">
          {value.map((photo) => (
            <div key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt={photo.name} />
              <span><Check size={12} /> Uploaded</span>
              <button type="button" aria-label={`Remove ${photo.name}`} onClick={() => { URL.revokeObjectURL(photo.previewUrl); ownedPreviewUrls.current.delete(photo.previewUrl); onChange(value.filter((item) => item.id !== photo.id)); }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

