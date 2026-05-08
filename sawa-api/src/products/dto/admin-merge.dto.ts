import { IsUUID, IsNotEmpty } from 'class-validator';

export class AdminMergeDto {
  @IsNotEmpty()
  @IsUUID()
  winnerId: string;

  @IsNotEmpty()
  @IsUUID()
  loserId: string;
}
