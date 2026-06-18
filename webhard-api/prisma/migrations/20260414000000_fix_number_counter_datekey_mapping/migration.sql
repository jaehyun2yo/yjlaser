-- AlterTable: rename dateKey column to date_key (fix @map mismatch)
ALTER TABLE "number_counters" RENAME COLUMN "dateKey" TO "date_key";
