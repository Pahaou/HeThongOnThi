import {
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePathDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}

export class UpdatePathDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

/** Danh sách khóa học của lộ trình theo đúng thứ tự, thay cho danh sách cũ. */
export class SetPathCoursesDto {
  @IsUUID('all', { each: true })
  @ArrayUnique()
  @ArrayMaxSize(50)
  courseIds!: string[];
}
