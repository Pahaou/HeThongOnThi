import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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
import { Difficulty } from '../../generated/prisma/client';

export const MAX_PRACTICE_QUESTIONS = 50;
export const MAX_PAPER_QUESTIONS = 200;

export class StartTopicPracticeDto {
  @IsUUID()
  courseId!: string;

  /** Bỏ trống = mọi chủ đề của khóa */
  @IsOptional()
  @IsUUID('all', { each: true })
  @ArrayUnique()
  @ArrayMaxSize(50)
  topicIds?: string[];

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsInt()
  @Min(1)
  @Max(MAX_PRACTICE_QUESTIONS)
  count!: number;
}

export class StartMockDto {
  @IsUUID()
  blueprintId!: string;
}

export class AnswerDto {
  @IsUUID('all', { each: true })
  @ArrayUnique()
  @ArrayMaxSize(8)
  selectedOptionIds!: string[];
}

export class BlueprintRuleDto {
  @IsUUID()
  topicId!: string;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;
}

export class BlueprintDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  /** Thời gian làm bài (giây): 1 phút đến 3 giờ */
  @IsInt()
  @Min(60)
  @Max(3 * 60 * 60)
  durationSec!: number;

  @ValidateNested({ each: true })
  @Type(() => BlueprintRuleDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  rules!: BlueprintRuleDto[];
}

export class PublishBlueprintDto {
  @IsBoolean()
  published!: boolean;
}
