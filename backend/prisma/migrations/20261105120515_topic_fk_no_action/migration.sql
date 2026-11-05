-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_topic_id_fkey";

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
