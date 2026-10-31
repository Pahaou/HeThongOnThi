import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ProgressDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  positionSec?: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
