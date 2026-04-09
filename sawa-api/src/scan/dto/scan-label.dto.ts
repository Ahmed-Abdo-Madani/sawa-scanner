import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ScanLabelDto {
  /**
   * Base64 encoded image data.
   */
  @IsString()
  @IsNotEmpty()
  image: string;

  /**
   * Optional GTIN if a barcode was already scanned and we are adding label data to it.
   */
  @IsString()
  @IsOptional()
  gtin?: string;
}
