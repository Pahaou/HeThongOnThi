-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CandidateVerdict" AS ENUM ('VALID', 'SUSPICIOUS', 'VIOLATION');

-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "opens_at" TIMESTAMPTZ NOT NULL,
    "closes_at" TIMESTAMPTZ NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT true,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_rules" (
    "exam_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "exam_rules_pkey" PRIMARY KEY ("exam_id","topic_id","difficulty")
);

-- CreateTable
CREATE TABLE "exam_candidates" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "verdict" "CandidateVerdict" NOT NULL DEFAULT 'VALID',
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMPTZ NOT NULL,
    "submitted_at" TIMESTAMPTZ,
    "total_count" INTEGER NOT NULL,
    "correct_count" INTEGER,
    "score" DOUBLE PRECISION,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_questions" (
    "attempt_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "question_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "selected_option_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "saved_at" TIMESTAMPTZ,
    "is_correct" BOOLEAN,

    CONSTRAINT "attempt_questions_pkey" PRIMARY KEY ("attempt_id","position")
);

-- CreateIndex
CREATE INDEX "exams_course_id_idx" ON "exams"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_candidates_exam_id_user_id_key" ON "exam_candidates"("exam_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_candidate_id_key" ON "exam_attempts"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attempt_id_question_id_key" ON "attempt_questions"("attempt_id", "question_id");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_rules" ADD CONSTRAINT "exam_rules_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_rules" ADD CONSTRAINT "exam_rules_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_candidates" ADD CONSTRAINT "exam_candidates_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_candidates" ADD CONSTRAINT "exam_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "exam_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
