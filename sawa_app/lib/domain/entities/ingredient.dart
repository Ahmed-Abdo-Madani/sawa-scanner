enum IngredientSfdaStatus {
  safe,
  restricted,
  prohibited,
}

class Ingredient {
  final String nameAr;
  final String nameEn;
  final String? eNumber;
  final IngredientSfdaStatus sfdaStatus;

  const Ingredient({
    required this.nameAr,
    required this.nameEn,
    this.eNumber,
    required this.sfdaStatus,
  });
}
