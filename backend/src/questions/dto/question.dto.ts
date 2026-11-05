import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  Difficulty,
  QuestionStatus,
  QuestionType,
} from '../../generated/prisma/client';
import { MAX_OPTIONS } from '../question-rules';

export class TopicDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class OptionDto {
  /** Có id thì sửa phương án cũ, không có thì tạo mới */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateQuestionDto {
  @IsUUID()
  topicId!: string;

  @IsOptional()
  @IsUUID()
  lessonId?: string | null;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanation?: string;

  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_OPTIONS)
  options!: OptionDto[];
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsUUID()
  lessonId?: string | null;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanation?: string;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  /** Gửi kèm thì thay toàn bộ danh sách phương án (giữ id những cái được gửi lại) */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_OPTIONS)
  options?: OptionDto[];
}

export class ListQuestionsQuery {
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: string }) => value?.trim())
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
