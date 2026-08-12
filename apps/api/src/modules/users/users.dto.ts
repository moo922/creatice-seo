import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ROLE_KEYS, USER_STATUSES, USER_TYPES, type RoleKey } from '@creative-seo/types';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName: string;

  @IsOptional()
  @IsIn(USER_TYPES)
  type: (typeof USER_TYPES)[number] = 'AGENCY';

  @IsOptional()
  @IsUUID()
  organizationId?: string | null;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ROLE_KEYS, { each: true })
  roleKeys: RoleKey[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];
}

export class AssignRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ROLE_KEYS, { each: true })
  roleKeys: RoleKey[];
}

export class UserQueryDto {
  @IsOptional()
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  perPage: number = 25;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsEnum(ROLE_KEYS, { message: 'role must be a valid role key' })
  role?: RoleKey;
}
