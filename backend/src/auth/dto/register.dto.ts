import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt chỉ dùng 72 byte đầu
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullName!: string;
}
