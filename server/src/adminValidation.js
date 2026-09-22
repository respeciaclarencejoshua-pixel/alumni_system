import { z } from 'zod';

const optionalText = z.string().trim().max(5000);
const nullableText = optionalText.nullable();
const nullableDate = z.union([z.iso.date(), z.iso.datetime({ offset: true }), z.literal(''), z.null()]).transform(value => value || null);

export const opportunityUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company_name: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(10000),
  category: optionalText,
  requirements: nullableText,
  employment_type: nullableText,
  work_arrangement: nullableText,
  salary_range: nullableText,
  reviewer_note: nullableText,
  required_experience: nullableText,
  required_course: nullableText,
  required_department: nullableText,
  contact_person: nullableText,
  industry: nullableText,
  contact_email: z.union([z.email(), z.literal(''), z.null()]),
  application_url: z.union([z.url({ protocol: /^https?$/ }), z.literal(''), z.null()]),
  application_deadline: nullableDate,
  openings: z.union([z.number().int().min(1).max(100000), z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(100000)), z.literal(''), z.null()]).transform(value => value || null),
  featured: z.boolean(),
  status: z.enum(['draft','submitted','under_review','needs_changes','approved','published','active','paused','expired','archived','rejected']),
}).partial().strip();

export const galleryCurationSchema = z.object({
  featured: z.boolean().optional(),
  featuredRank: z.union([z.number().int().min(1).max(100000), z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(100000)), z.literal(''), z.null()]).optional(),
  featuredStartsAt: nullableDate.optional(),
  featuredEndsAt: nullableDate.optional(),
  status: z.literal('archived').optional(),
  reason: z.string().trim().max(1000).optional(),
}).strict();
