import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Difficulty } from '../../generated/prisma/client';

/** Gửi dạng multipart (kèm file) nên số phải tự chuyển kiểu */
export class GenerateQuestionsDto {
  @IsUUID()
  topicId!: string;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  count!: number;

  /** Dùng nội dung bài học làm tài liệu (khi không tải file) */
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  /** Hoặc dán nội dung trực tiếp */
  @IsOptional()
  @IsString()
  @MaxLength(60_000)
  text?: string;
}
