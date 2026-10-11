import { z } from "zod";

export const problemStatusSchema = z.enum([
  "open",
  "in_progress",
  "resolved",
  "cancelled",
]);
export const problemPrioritySchema = z.enum([
  "low",
  "normal",
  "high",
  "urgent",
]);
export const revisionInputSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const maintenanceScooterSchema = z.object({
  id: z.string(),
  fleetNumber: z.number().int(),
  model: z.string().nullable(),
  brandName: z.string(),
  registrationNumber: z.string().nullable(),
});
export const problemSchema = z.object({
  id: z.string(),
  scooterId: z.string(),
  scooter: maintenanceScooterSchema,
  description: z.string(),
  priority: problemPrioritySchema,
  status: problemStatusSchema,
  assigneeId: z.string().nullable(),
  assigneeNeedsReassignment: z.boolean().optional(),
  revision: z.number().int(),
  workNotes: z.string().optional(),
  resolutionNotes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export const problemListSchema = z.object({
  items: z.array(problemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const listProblemsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    view: z.enum(["assigned", "available", "all"]).optional(),
    status: problemStatusSchema.optional(),
    scooterId: z.string().optional(),
  })
  .strict();
export const createProblemInputSchema = z
  .object({
    scooterId: z.string().min(1),
    description: z.string().trim().min(1).max(4000),
  })
  .strict();
export const updateProblemInputSchema = revisionInputSchema.extend({
  workNotes: z.string().trim().max(10000).optional(),
  startWork: z.boolean().optional(),
});
export const resolveProblemInputSchema = revisionInputSchema.extend({
  resolutionNotes: z.string().trim().min(1).max(4000),
});
export const assignProblemInputSchema = revisionInputSchema.extend({
  assigneeId: z.string().min(1).nullable(),
});
export const prioritizeProblemInputSchema = revisionInputSchema.extend({
  priority: problemPrioritySchema,
});
export const eligibleAssigneeSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});
export const eligibleAssigneeListSchema = z.object({
  items: z.array(eligibleAssigneeSchema),
});
export type Problem = z.infer<typeof problemSchema>;
export type ListProblemsQuery = z.infer<typeof listProblemsQuerySchema>;
export type CreateProblemInput = z.infer<typeof createProblemInputSchema>;
export type UpdateProblemInput = z.infer<typeof updateProblemInputSchema>;
export type ResolveProblemInput = z.infer<typeof resolveProblemInputSchema>;
export type AssignProblemInput = z.infer<typeof assignProblemInputSchema>;
export type PrioritizeProblemInput = z.infer<
  typeof prioritizeProblemInputSchema
>;
