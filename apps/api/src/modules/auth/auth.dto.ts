import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class RefreshDto {
  /** Optional when the refresh token is provided via the httpOnly cookie. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
