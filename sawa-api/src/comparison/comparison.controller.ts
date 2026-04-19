import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ComparisonService } from './comparison.service';
import { Public } from '../auth/public.decorator';

@Public()
@Controller()
export class ComparisonController {
  constructor(private readonly comparisonService: ComparisonService) {}

  /**
   * Find products similar to the given product by category, subcategory, and weight.
   */
  @Get('products/:gtin/similar')
  async findSimilar(
    @Param('gtin') gtin: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 10, 50) : 10;
    return this.comparisonService.findSimilarProducts(gtin, parsedLimit);
  }

  /**
   * Side-by-side comparison of two products.
   */
  @Get('comparison')
  async compareProducts(
    @Query('gtinA') gtinA: string,
    @Query('gtinB') gtinB: string,
  ) {
    if (!gtinA || !gtinB) {
      throw new BadRequestException('Both gtinA and gtinB query params are required');
    }
    return this.comparisonService.compareProducts(gtinA, gtinB);
  }

  /**
   * Quick recommendation between two products.
   */
  @Get('comparison/recommend')
  async recommendBetter(
    @Query('gtinA') gtinA: string,
    @Query('gtinB') gtinB: string,
  ) {
    if (!gtinA || !gtinB) {
      throw new BadRequestException('Both gtinA and gtinB query params are required');
    }
    const result = await this.comparisonService.compareProducts(gtinA, gtinB);
    return result.recommendation;
  }
}
