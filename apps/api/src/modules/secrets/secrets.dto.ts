import { IsIn, IsNotEmptyObject, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { SITE_SECRET_KINDS, type SiteSecretKind } from '@creative-seo/types';

export class CreateSecretDto {
  @IsIn(SITE_SECRET_KINDS)
  kind: SiteSecretKind;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsObject()
  @IsNotEmptyObject()
  payload: Record<string, string>;
}
