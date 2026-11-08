import { z } from "zod";
import { homeSchema, postSchema } from "@/lib/schemas";

const documentFields = {
  id: z.string(),
  state: z.enum(["DRAFT", "PUBLISHED", "PRIVATE", "TRASH"]),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  firstPublishedAt: z.string().nullable(),
  lastPublishedAt: z.string().nullable(),
};
const homeRevision = z.object({ data: homeSchema, updatedAt: z.string() });
const postRevision = z.object({ data: postSchema, updatedAt: z.string() });
export const adminDocumentSchema = z.discriminatedUnion("kind", [
  z.object({
    ...documentFields,
    kind: z.literal("HOME"),
    draft: homeRevision.nullable(),
    published: homeRevision.nullable(),
  }),
  z.object({
    ...documentFields,
    kind: z.enum(["BLOG", "PROJECT"]),
    draft: postRevision.nullable(),
    published: postRevision.nullable(),
  }),
]);
export type AdminDocument = z.infer<typeof adminDocumentSchema>;
export type ContentAction =
  "publish" | "discard" | "private" | "trash" | "restore" | "delete";
export type DataChange<T> = (update: (current: T) => T) => void;
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
