import { IsString, MinLength } from 'class-validator';

export class CreateCustomerNoteDto {
  @IsString()
  @MinLength(1)
  content!: string;
}
