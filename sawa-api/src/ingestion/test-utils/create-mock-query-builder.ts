export function createMockQueryBuilder(rowsByCall: any[][], onGetMany?: (callCount: number) => void) {
  let callCount = 0;
  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => {
      if (onGetMany) {
        onGetMany(callCount);
      }
      const result = callCount < rowsByCall.length ? rowsByCall[callCount] : [];
      callCount++;
      return result;
    }),
  };
  return mockQueryBuilder;
}
