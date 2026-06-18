-- AlterTable
ALTER TABLE "drawing_revisions" ADD COLUMN     "webhard_file_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
