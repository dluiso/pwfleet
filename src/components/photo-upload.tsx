"use client";

import { Camera, Check, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

export type UploadedPhoto = { id: string; name: string; previewUrl: string };

export function PhotoUpload({
  value,
  onChange,
  onUploadingChange,
}: {
  value: UploadedPhoto[];
  onChange: (photos: UploadedPhoto[]) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    onUploadingChange(true);
    const previewUrl = URL.createObjectURL(file);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body });
      const result = (await response.json()) as { id?: string; name?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Photo upload failed.");
      onChange([...value, { id: result.id, name: result.name ?? file.name, previewUrl }]);
    } catch (uploadError) {
      URL.revokeObjectURL(previewUrl);
      setError(uploadError instanceof Error ? uploadError.message : "Photo upload failed.");
    } finally {
      setUploading(false);
      onUploadingChange(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="photo-upload">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button className="photo-button" type="button" disabled={uploading || value.length >= 5} onClick={() => inputRef.current?.click()}>
        {uploading ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />}
        {uploading ? "Uploading…" : "Add defect photo"}
      </button>
      {value.length ? (
        <div className="photo-preview-list">
          {value.map((photo) => (
            <div key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt={photo.name} />
              <span><Check size={12} /> Uploaded</span>
              <button type="button" aria-label={`Remove ${photo.name}`} onClick={() => onChange(value.filter((item) => item.id !== photo.id))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

