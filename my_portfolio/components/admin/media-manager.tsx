/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, FileText } from "lucide-react";
import { Confirm, Field } from "@/components/admin/shared";
import { errorMessage } from "@/lib/error-message";
import { useAdminCollection } from "@/components/admin/use-admin-collection";
import { api } from "@/lib/admin-api";
import { uploadFile } from "@/lib/media-upload";
import type { MediaItem } from "@/lib/admin-types";
function MediaRow(props: { media: MediaItem; reload: () => Promise<void> }) {
  const session = useRef({ active: false, request: 0 });
  useEffect(() => {
    const scope = { active: true, request: 0 };
    session.current = scope;

    return () => {
      scope.active = false;
    };
  }, [props.media.id]);
  const [name, setName] = useState(props.media.name);
  const [alt, setAlt] = useState(props.media.alt);
  const [status, setStatus] = useState("");
  async function deleteMedia() {
    const scope = session.current;
    await api("/api/admin/media", "DELETE", { id: props.media.id });
    if (scope.active) await props.reload();
  }
  async function saveInfo() {
    const scope = session.current;
    const request = ++scope.request;
    const ownsRequest = () => scope.active && request === scope.request;
    try {
      await api("/api/admin/media", "PATCH", {
        id: props.media.id,
        name,
        alt,
      });
      if (!ownsRequest()) return;
      setStatus("정보를 저장했습니다.");
      await props.reload();
    } catch (error) {
      if (ownsRequest()) setStatus(errorMessage(error));
    }
  }
  return (
    <article className="media-row">
      <div className="media-thumb">
        {props.media.status === "READY" ? (
          props.media.mime.startsWith("image/") ? (
            <img src={`/media/${props.media.id}?w=300`} alt={props.media.alt} />
          ) : (
            <a
              href={`/media/${props.media.id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${props.media.name} PDF 열기`}
            >
              <FileText size={40} />
            </a>
          )
        ) : (
          <span>{props.media.status}</span>
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
          {props.media.mime} · {(props.media.size / 1_000_000).toFixed(2)} MB ·{" "}
          {props.media.status}
        </p>
        <div className="form-actions">
          <button className="button secondary" onClick={saveInfo}>
            정보 저장
          </button>
          <Confirm
            label="파일 삭제"
            title="파일을 삭제할까요?"
            description="파일 저장소에서 영구 삭제합니다. 공개본이나 초안에서 사용 중이면 삭제할 수 없습니다."
            danger
            onConfirm={deleteMedia}
          />
        </div>
        <p className="small" role="status">
          {status}
        </p>
        <div className="media-uses">
          <strong className="small">사용처 {props.media.uses.length}곳</strong>
          {props.media.uses.map((use, i) => (
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
  const {
    items: media,
    error,
    loading,
    setError,
    reload,
    session,
  } = useAdminCollection<MediaItem>("/api/admin/media");
  const [busy, setBusy] = useState(false);
  async function uploadMedia(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const scope = session.current;
    setBusy(true);
    setError("");
    try {
      await uploadFile(file);
      if (scope.active) await reload();
    } catch (error) {
      if (scope.active) setError(errorMessage(error));
    } finally {
      if (scope.active) setBusy(false);
    }
  }
  useEffect(() => () => setBusy(false), []);
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
            onChange={uploadMedia}
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
