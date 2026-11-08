/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
"use client";
import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/lib/media-upload";
import { Upload } from "lucide-react";
import { api } from "@/lib/admin-api";
import type { MediaItem } from "@/lib/admin-types";
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
  const session = useRef({ active: false });
  useEffect(() => {
    const scope = { active: true };
    session.current = scope;
    api<MediaItem[]>("/api/admin/media")
      .then((items) => {
        if (scope.active) setMedia(items);
      })
      .catch((e) => {
        if (scope.active) setError(e.message);
      });
    return () => {
      scope.active = false;
      setBusy(false);
    };
  }, []);
  async function selectMedia(load: () => Promise<MediaItem>) {
    const scope = session.current;
    setBusy(true);
    setError("");
    try {
      const media = await load();
      if (!scope.active) return;
      setMedia((previous) => [
        media,
        ...previous.filter((item) => item.id !== media.id),
      ]);
      onChange(media.id);
      setUrl("");
    } catch (error) {
      if (scope.active)
        setError(
          error instanceof Error ? error.message : "파일 처리에 실패했습니다.",
        );
    } finally {
      if (scope.active) setBusy(false);
    }
  }
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
        disabled={busy}
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
            await selectMedia(() => uploadFile(file));
          }}
        />
      </label>
      {!pdf && (
        <div className="inline-form">
          <input
            aria-label={`${label} 외부 이미지 주소`}
            placeholder="https://… 외부 이미지 가져오기"
            value={url}
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            className="button secondary"
            disabled={busy || !url}
            onClick={() =>
              void selectMedia(() =>
                api<MediaItem>("/api/admin/media", "POST", {
                  action: "import",
                  url,
                }),
              )
            }
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
