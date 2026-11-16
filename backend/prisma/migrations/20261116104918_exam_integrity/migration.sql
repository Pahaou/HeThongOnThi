-- CreateEnum
CREATE TYPE "AttemptEventType" AS ENUM ('TAB_HIDDEN', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'COPY', 'PASTE', 'CONTEXT_MENU', 'SESSION_TAKEOVER', 'FULLSCREEN_ENTER', 'RECONNECT');

-- AlterTable
ALTER TABLE "exam_attempts" ADD COLUMN     "violation_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "time_extensions" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "granted_by_id" UUID NOT NULL,
    "extra_sec" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_events" (
    "id" BIGSERIAL NOT NULL,
    "attempt_id" UUID NOT NULL,
    "type" "AttemptEventType" NOT NULL,
    "client_at" TIMESTAMPTZ NOT NULL,
    "server_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" TEXT,

    CONSTRAINT "attempt_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_extensions_attempt_id_idx" ON "time_extensions"("attempt_id");

-- CreateIndex
CREATE INDEX "attempt_events_attempt_id_client_at_idx" ON "attempt_events"("attempt_id", "client_at");

-- AddForeignKey
ALTER TABLE "time_extensions" ADD CONSTRAINT "time_extensions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_extensions" ADD CONSTRAINT "time_extensions_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
