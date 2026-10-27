import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LessonType } from '../../generated/prisma/client';

export class CreateLessonDto {
  @IsEnum(LessonType)
  type!: LessonType;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  content?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  durationSec?: number;
}

export class UpdateLessonDto {
  @IsOptional()
  @IsEnum(LessonType)
  type?: LessonType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  videoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  content?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  durationSec?: number;
}
