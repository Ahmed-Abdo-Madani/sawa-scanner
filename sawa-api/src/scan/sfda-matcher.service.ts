import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Raw } from 'typeorm';
import { SfdaProhibitedIngredient } from '../entities/sfda-prohibited-ingredient.entity';
import { StructuredIngredientDto } from './dto/structured-label.dto';

interface MatchedIngredient extends StructuredIngredientDto {
  sfda_status: 'safe' | 'restricted' | 'prohibited';
  restriction_note?: string;
}

@Injectable()
export class SfdaMatcherService {
  constructor(
    @InjectRepository(SfdaProhibitedIngredient)
    private sfdaRepo: Repository<SfdaProhibitedIngredient>,
  ) {}

  async matchIngredients(
    ingredients: StructuredIngredientDto[],
  ): Promise<MatchedIngredient[]> {
    const eNumbers = ingredients.map((i) => i.e_number).filter(Boolean);
    const namesEn = ingredients
      .map((i) => i.name_en?.toLowerCase())
      .filter(Boolean);

    // Find matches in DB
    const matches = await this.sfdaRepo.find({
      where: [
        { e_number: In(eNumbers) },
        {
          name_en: Raw((alias) => `LOWER(${alias}) IN (:...namesEn)`, {
            namesEn,
          }),
        },
      ],
    });

    return ingredients.map((ing) => {
      // Priority 1: E-Number match
      let match = ing.e_number
        ? matches.find((m) => m.e_number === ing.e_number)
        : null;

      // Priority 2: Name match
      if (!match && ing.name_en) {
        match = matches.find(
          (m) => m.name_en.toLowerCase() === ing.name_en.toLowerCase(),
        );
      }

      return {
        ...ing,
        sfda_status: match ? match.sfda_status : 'safe',
        restriction_note: match ? match.restriction_note : undefined,
      };
    });
  }
}
