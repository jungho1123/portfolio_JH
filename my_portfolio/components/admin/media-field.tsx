/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
"use client";
import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/lib/media-upload";
import { Upload } from "lucide-react";
import { errorMessage } from "@/lib/error-message";
import { api } from "@/lib/admin-api";
import type { MediaItem } from "@/lib/admin-types";
export function MediaField(props: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  pdf?: boolean;
}) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const session = useRef({ active: false, request: 0 });
  useEffect(() => {
    const scope = { active: true, request: 1 };
    session.current = scope;
    api<MediaItem[]>("/api/admin/media")
      .then((items) => {
        if (scope.active && scope.request === 1) setMedia(items);
      })
      .catch((e) => {
        if (scope.active && scope.request === 1) setError(errorMessage(e));
      });
    return () => {
      scope.active = false;
      setBusy(false);
    };
  }, []);
  async function selectMedia(load: () => Promise<MediaItem>) {
    const scope = session.current;
    const request = ++scope.request;
    const ownsRequest = () => scope.active && request === scope.request;
    setBusy(true);
    setError("");
    try {
      const media = await load();
      if (!ownsRequest()) return;
      setMedia((previous) => [
        media,
        ...previous.filter((item) => item.id !== media.id),
      ]);
      props.onChange(media.id);
      setUrl("");
    } catch (error) {
      if (ownsRequest())
        setError(
          error instanceof Error ? error.message : "파일 처리에 실패했습니다.",
        );
    } finally {
      if (ownsRequest()) setBusy(false);
    }
  }
  async function uploadMedia(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    await selectMedia(() => uploadFile(file));
  }
  const valid = media.filter(
    (m) =>
      m.status === "READY" &&
      ((props.pdf ?? false)
        ? m.mime === "application/pdf"
        : m.mime.startsWith("image/")),
  );
  return (
    <fieldset className="media-field">
      <legend>{props.label}</legend>
      {props.value && !(props.pdf ?? false) && (
        <img
          className="media-preview"
          src={`/media/${props.value}?w=400`}
          alt={`${props.label} 미리보기`}
        />
      )}
      <label className="sr-only" htmlFor={`media-${props.label}`}>
        {props.label} 선택
      </label>
      <select
        id={`media-${props.label}`}
        value={props.value || ""}
        disabled={busy}
        onChange={(e) => props.onChange(e.target.value || null)}
      >
        <option value="">선택 안 함</option>
        {valid.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
        {props.value && !valid.some((m) => m.id === props.value) && (
          <option value={props.value}>현재 파일</option>
        )}
      </select>
      <label className="button secondary upload-label">
        <Upload size={14} />
        {busy
          ? "업로드·검증 중…"
          : (props.pdf ?? false)
            ? "PDF 업로드"
            : "이미지 업로드"}
        <input
          type="file"
          disabled={busy}
          accept={
            (props.pdf ?? false)
              ? "application/pdf"
              : "image/jpeg,image/png,image/webp"
          }
          className="sr-only"
          onChange={uploadMedia}
        />
      </label>
      {!(props.pdf ?? false) && (
        <div className="inline-form">
          <input
            aria-label={`${props.label} 외부 이미지 주소`}
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
      {(props.pdf ?? false) && props.value && (
        <a
          className="text-link small"
          href={`/media/${props.value}`}
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
