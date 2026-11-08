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
  ValidateNested,
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

export class SessionDto {
  /** Mã ngẫu nhiên của tab đang làm bài */
  @IsUUID()
  sessionId!: string;
}

export class AnswerItemDto {
  @IsUUID()
  questionId!: string;

  @IsUUID('all', { each: true })
  @ArrayUnique()
  @ArrayMaxSize(8)
  selectedOptionIds!: string[];

  /** Thời điểm thí sinh chọn, theo giờ server đã hiệu chỉnh ở client */
  @Type(() => Date)
  @IsDate()
  clientSavedAt!: Date;
}

export class SaveAnswersDto extends SessionDto {
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  answers!: AnswerItemDto[];
}
