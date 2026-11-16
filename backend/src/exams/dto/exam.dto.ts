import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsDate,
  IsEmail,
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
  AttemptEventType,
  CandidateVerdict,
} from '../../generated/prisma/client';

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

export class ExtendTimeDto {
  @IsInt()
  @Min(1)
  @Max(180)
  minutes!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** Sự kiện client được phép gửi (SESSION_TAKEOVER chỉ server ghi) */
export const CLIENT_EVENT_TYPES = [
  AttemptEventType.TAB_HIDDEN,
  AttemptEventType.WINDOW_BLUR,
  AttemptEventType.FULLSCREEN_EXIT,
  AttemptEventType.FULLSCREEN_ENTER,
  AttemptEventType.COPY,
  AttemptEventType.PASTE,
  AttemptEventType.CONTEXT_MENU,
  AttemptEventType.RECONNECT,
] as const;

export class EventItemDto {
  @IsEnum(CLIENT_EVENT_TYPES)
  type!: (typeof CLIENT_EVENT_TYPES)[number];

  @Type(() => Date)
  @IsDate()
  clientAt!: Date;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  detail?: string;
}

export class RecordEventsDto extends SessionDto {
  @ValidateNested({ each: true })
  @Type(() => EventItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  events!: EventItemDto[];
}

export class VerdictDto {
  @IsEnum(CandidateVerdict)
  verdict!: CandidateVerdict;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
