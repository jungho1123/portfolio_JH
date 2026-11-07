import type { HomeData, PostData } from "@/lib/schemas";
export type AdminDocument = {
  id: string;
  kind: "HOME" | "BLOG" | "PROJECT";
  state: "DRAFT" | "PUBLISHED" | "PRIVATE" | "TRASH";
  revision: number;
  createdAt: string;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  draft: { data: HomeData | PostData; updatedAt: string } | null;
  published: { data: HomeData | PostData; updatedAt: string } | null;
};
export type MediaItem = {
  id: string;
  name: string;
  mime: string;
  size: number;
  alt: string;
  pathname: string;
  status: string;
  uses: {
    revision: {
      contentId: string;
      draftOf: { id: string } | null;
      publicOf: { id: string; state: string } | null;
    };
  }[];
};
export type TaxonItem = {
  id: string;
  kind: "BLOG" | "PROJECT";
  type: "CATEGORY" | "TAG";
  name: string;
  count: number;
};
