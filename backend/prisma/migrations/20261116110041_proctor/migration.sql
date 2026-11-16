-- AlterTable
ALTER TABLE "exam_attempts" ADD COLUMN     "last_seen_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "exam_candidates" ADD COLUMN     "verdict_note" TEXT;
