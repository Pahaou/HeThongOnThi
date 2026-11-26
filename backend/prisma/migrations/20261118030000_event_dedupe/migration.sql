-- AlterTable
ALTER TABLE "attempt_events" ADD COLUMN     "client_event_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "attempt_events_attempt_id_client_event_id_key" ON "attempt_events"("attempt_id", "client_event_id");
