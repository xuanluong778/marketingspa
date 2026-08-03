import { IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateMetaFanpagePostDto {
  @IsString()
  @MinLength(1, { message: 'Nội dung bài đăng không được trống' })
  @MaxLength(8000, { message: 'Nội dung tối đa 8000 ký tự' })
  message!: string;

  @IsOptional()
  @ValidateIf((_, v) => typeof v === 'string' && v.trim().length > 0)
  @IsUrl({ require_protocol: true }, { message: 'Link phải là URL hợp lệ (http/https)' })
  @MaxLength(2000)
  link?: string;

  @IsOptional()
  @ValidateIf((_, v) => typeof v === 'string' && v.trim().length > 0)
  @IsUrl({ require_protocol: true }, { message: 'Ảnh phải là URL hợp lệ (http/https)' })
  @MaxLength(2000)
  imageUrl?: string;
}
