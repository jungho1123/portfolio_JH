ALTER TABLE "Slug" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Slug" SET "published" = true;
