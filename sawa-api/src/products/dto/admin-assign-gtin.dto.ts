import { IsNotEmpty, Matches } from 'class-validator';

export class AdminAssignGtinDto {
  @IsNotEmpty()
  @Matches(/^\d{8}$|^\d{12,14}$/)
  gtin: string;
}
