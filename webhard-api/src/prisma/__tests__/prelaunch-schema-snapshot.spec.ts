import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PRELAUNCH_SCHEMA_SNAPSHOT } from '../__fixtures__/prelaunch-schema-snapshot.fixture';

function readPrismaSchema(): string {
  return readFileSync(resolve(__dirname, '../../../prisma/schema.prisma'), 'utf8');
}

function normalizePrisma(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractModelBlock(schema: string, modelName: string): string {
  const lines = schema.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === `model ${modelName} {`);

  if (startIndex === -1) {
    throw new Error(`Prisma model not found: ${modelName}`);
  }

  const endIndex = lines.findIndex((line, index) => index > startIndex && line.trim() === '}');

  if (endIndex === -1) {
    throw new Error(`Prisma model is not closed: ${modelName}`);
  }

  return lines.slice(startIndex, endIndex + 1).join('\n');
}

describe('prelaunch Prisma schema snapshot (YJL-CENT-010)', () => {
  const schema = readPrismaSchema();

  for (const expectedModel of PRELAUNCH_SCHEMA_SNAPSHOT) {
    describe(expectedModel.model, () => {
      const modelBlock = extractModelBlock(schema, expectedModel.model);
      const normalizedModelBlock = normalizePrisma(modelBlock);

      it('keeps the mapped table name', () => {
        expect(normalizedModelBlock).toContain(`@@map("${expectedModel.table}")`);
      });

      it('keeps required scalar fields', () => {
        for (const field of expectedModel.scalarFields) {
          expect(normalizedModelBlock).toContain(normalizePrisma(field));
        }
      });

      it('keeps current relations', () => {
        for (const relation of expectedModel.relationFields) {
          expect(normalizedModelBlock).toContain(normalizePrisma(relation));
        }
      });

      it('keeps lookup indexes and unique constraints used by current workflows', () => {
        for (const indexSnippet of expectedModel.indexSnippets) {
          expect(normalizedModelBlock).toContain(normalizePrisma(indexSnippet));
        }
      });
    });
  }
});
