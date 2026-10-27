import {
  ArrayUnique,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChapterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}

/** Danh sách id theo thứ tự mới; phải chứa đủ mọi phần tử hiện có. */
export class ReorderDto {
  @IsUUID('all', { each: true })
  @ArrayUnique()
  ids!: string[];
}
