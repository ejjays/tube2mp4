import { z } from 'zod';

export const ExpectedSchema = z.object({
  status: z.string().optional(),
  title: z.string().optional(),
  type: z.enum(['video', 'audio', 'image']).optional(),
  error: z.string().optional(),
  mustHaveIsrc: z.boolean().optional(),
  mustHaveChords: z.boolean().optional(),
});

export const CaseSchema = z.object({
  name: z.string(),
  url: z.string().url('Invalid URL in fixture'),
  expected: ExpectedSchema,
  mockData: z.string().optional(),
});

export type Case = z.infer<typeof CaseSchema>;
export type Expected = z.infer<typeof ExpectedSchema>;
