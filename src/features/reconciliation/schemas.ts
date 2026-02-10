import { z } from 'zod';

export const dataSourceSchema = z.enum(['sourceA', 'sourceB']);

export const columnMappingSchema = z.object({
  amount: z.string().min(1, 'Select amount column'),
  date: z.string().min(1, 'Select date column'),
  reference: z.string().min(1, 'Select reference column'),
});

export const matchingTypeSchema = z.enum(['oneToOne', 'group']);

export const matchTypeSchema = z.enum([
  'exact',
  'tolerance_numeric',
  'tolerance_date',
  'similar_text',
  'contains',
]);

export const toleranceNumericModeSchema = z.enum(['fixed', 'percentage']);

export const matchingRuleSchema = z.object({
  id: z.string(),
  columnA: z.string(),
  columnB: z.string(),
  matchType: matchTypeSchema,
  toleranceValue: z.number().min(0).optional(),
  toleranceNumericMode: toleranceNumericModeSchema.optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  weight: z.number().min(0),
});

export const matchingConfigSchema = z.object({
  rules: z.array(matchingRuleSchema).min(1),
  minConfidenceThreshold: z.number().min(0).max(1),
  matchingType: matchingTypeSchema,
});

export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;
export type MatchingConfigInput = z.infer<typeof matchingConfigSchema>;
