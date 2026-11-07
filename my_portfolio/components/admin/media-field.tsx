/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
"use client";
import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Upload } from "lucide-react";
import { api } from "@/components/admin/shared";
import type { MediaItem } from "@/lib/admin-types";
export async function uploadFile(file: File) {
  const pending = await api<MediaItem>("/api/admin/media", "POST", {
    name: file.name,
    mime: file.type,
    size: file.size,
  });
  await upload(pending.pathname, file, {
    access: "private",
    contentType: file.type,
    handleUploadUrl: "/api/admin/upload",
    clientPayload: JSON.stringify({ id: pending.id }),
    multipart: file.size > 5_000_000,
  });
  return api<MediaItem>("/api/admin/media", "POST", {
    action: "verify",
    id: pending.id,
  });
}
export function MediaField({
  label,
  value,
  onChange,
  pdf = false,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  pdf?: boolean;
}) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => {
    api<MediaItem[]>("/api/admin/media")
      .then(setMedia)
      .catch((e) => setError(e.message));
  }, []);
  const valid = media.filter(
    (m) =>
      m.status === "READY" &&
      (pdf ? m.mime === "application/pdf" : m.mime.startsWith("image/")),
  );
  return (
    <fieldset className="media-field">
      <legend>{label}</legend>
      {value && !pdf && (
        <img
          className="media-preview"
          src={`/media/${value}?w=400`}
          alt={`${label} 미리보기`}
        />
      )}
      <label className="sr-only" htmlFor={`media-${label}`}>
        {label} 선택
      </label>
      <select
        id={`media-${label}`}
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">선택 안 함</option>
        {valid.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
        {value && !valid.some((m) => m.id === value) && (
          <option value={value}>현재 파일</option>
        )}
      </select>
      <label className="button secondary upload-label">
        <Upload size={14} />
        {busy ? "업로드·검증 중…" : pdf ? "PDF 업로드" : "이미지 업로드"}
        <input
          type="file"
          disabled={busy}
          accept={pdf ? "application/pdf" : "image/jpeg,image/png,image/webp"}
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = "";
            setBusy(true);
            setError("");
            try {
              const m = await uploadFile(file);
              setMedia((prev) => [m, ...prev]);
              onChange(m.id);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {!pdf && (
        <div className="inline-form">
          <input
            aria-label={`${label} 외부 이미지 주소`}
            placeholder="https://… 외부 이미지 가져오기"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            className="button secondary"
            disabled={busy || !url}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const m = await api<MediaItem>("/api/admin/media", "POST", {
                  action: "import",
                  url,
                });
                setMedia((prev) => [m, ...prev]);
                onChange(m.id);
                setUrl("");
              } catch (e) {
                setError(
                  `${(e as Error).message} 직접 업로드로 다시 시도할 수 있습니다.`,
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            가져오기
          </button>
        </div>
      )}
      {pdf && value && (
        <a
          className="text-link small"
          href={`/media/${value}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          선택한 PDF 확인 ↗
        </a>
      )}
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
