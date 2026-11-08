-- AlterEnum
ALTER TYPE "ExamAttemptStatus" ADD VALUE 'GRADED';

-- AlterTable
ALTER TABLE "attempt_questions" ADD COLUMN     "client_saved_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "exam_attempts" ADD COLUMN     "active_session_id" UUID,
ADD COLUMN     "graded_at" TIMESTAMPTZ,
ADD COLUMN     "session_takeovers" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "exam_attempts_status_deadline_at_idx" ON "exam_attempts"("status", "deadline_at");
