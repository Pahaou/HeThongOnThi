import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsDate,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateExamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  /** Đề thi thử dùng làm ma trận; ma trận được chép sang kỳ thi */
  @IsUUID()
  blueprintId!: string;

  @Type(() => Date)
  @IsDate()
  opensAt!: Date;

  @Type(() => Date)
  @IsDate()
  closesAt!: Date;

  @IsInt()
  @Min(60)
  @Max(5 * 60 * 60)
  durationSec!: number;

  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;
}

export class UpdateExamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  opensAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  closesAt?: Date;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(5 * 60 * 60)
  durationSec?: number;

  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;
}

export class PublishExamDto {
  @IsBoolean()
  published!: boolean;
}

export class AddCandidatesDto {
  @IsEmail({}, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  emails!: string[];
}

export class SaveAnswerDto {
  @IsUUID('all', { each: true })
  @ArrayUnique()
  @ArrayMaxSize(8)
  selectedOptionIds!: string[];
}
