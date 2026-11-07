/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Upload, FileText } from "lucide-react";
import { api, Confirm, Field } from "@/components/admin/shared";
import { uploadFile } from "@/components/admin/media-field";
import type { MediaItem } from "@/lib/admin-types";
function MediaRow({
  media,
  reload,
}: {
  media: MediaItem;
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState(media.name);
  const [alt, setAlt] = useState(media.alt);
  const [status, setStatus] = useState("");
  return (
    <article className="media-row">
      <div className="media-thumb">
        {media.status === "READY" ? (
          media.mime.startsWith("image/") ? (
            <img src={`/media/${media.id}?w=300`} alt={media.alt} />
          ) : (
            <a
              href={`/media/${media.id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${media.name} PDF 열기`}
            >
              <FileText size={40} />
            </a>
          )
        ) : (
          <span>{media.status}</span>
        )}
      </div>
      <div className="media-info">
        <Field label="파일 이름">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="기본 대체 텍스트">
          <input value={alt} onChange={(e) => setAlt(e.target.value)} />
        </Field>
        <p className="small muted">
          {media.mime} · {(media.size / 1_000_000).toFixed(2)} MB ·{" "}
          {media.status}
        </p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await api("/api/admin/media", "PATCH", {
                  id: media.id,
                  name,
                  alt,
                });
                setStatus("정보를 저장했습니다.");
                await reload();
              } catch (e) {
                setStatus((e as Error).message);
              }
            }}
          >
            정보 저장
          </button>
          <Confirm
            label="파일 삭제"
            title="파일을 삭제할까요?"
            description="파일 저장소에서 영구 삭제합니다. 공개본이나 초안에서 사용 중이면 삭제할 수 없습니다."
            danger
            onConfirm={async () => {
              await api("/api/admin/media", "DELETE", { id: media.id });
              await reload();
            }}
          />
        </div>
        <p className="small" role="status">
          {status}
        </p>
        <div className="media-uses">
          <strong className="small">사용처 {media.uses.length}곳</strong>
          {media.uses.map((use, i) => (
            <Link
              key={i}
              className="text-link small"
              href={`/admin/edit/${use.revision.contentId}`}
            >
              {use.revision.contentId === "home"
                ? "홈"
                : use.revision.contentId}{" "}
              ·{" "}
              {use.revision.draftOf
                ? "초안"
                : `공개본 (${use.revision.publicOf?.state || "이전"})`}
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
export function MediaManager() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function reload() {
    setMedia(await api<MediaItem[]>("/api/admin/media"));
  }
  useEffect(() => {
    api<MediaItem[]>("/api/admin/media")
      .then(setMedia)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">ASSET LIBRARY</p>
          <h1>미디어</h1>
          <p className="muted">
            파일의 공개 여부는 현재 공개본의 사용처로 결정됩니다.
          </p>
        </div>
        <label className="button upload-label">
          <Upload size={15} />
          {busy ? "업로드·검증 중…" : "파일 업로드"}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = "";
              setBusy(true);
              setError("");
              try {
                await uploadFile(file);
                await reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">파일을 불러오는 중…</p>
      ) : media.length ? (
        media.map((m) => <MediaRow key={m.id} media={m} reload={reload} />)
      ) : (
        <div className="empty-state">
          <h2>등록된 파일이 없습니다.</h2>
          <p>이미지와 PDF 이력서를 업로드할 수 있습니다.</p>
        </div>
      )}
    </>
  );
}
