import { z } from "zod";
import {
  attachScooterPhotoSchema,
  createScooterPhotoUploadSchema,
  scooterPhotoUploadSchema,
} from "../scooters/scooter-photos.schemas";

export const MAINTENANCE_HOLD_ERROR_CODE = "SCOOTER_MAINTENANCE_HOLD";

/** Historical impact values, retained in audit entries and legacySeverity only. */
export const legacyProblemSeveritySchema = z.enum([
  "low",
  "moderate",
  "high",
  "critical",
]);

export const problemDifficultySchema = z.enum(["easy", "medium", "hard"]);
export const PROBLEM_PHOTO_MAX_FILES = 10;
export const createProblemPhotoUploadSchema =
  createScooterPhotoUploadSchema.strict();
export const problemPhotoUploadSchema = scooterPhotoUploadSchema;
export const problemPhotoDraftSchema = attachScooterPhotoSchema.strict();
export const problemPhotoSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  contentUrl: z.string(),
  createdAt: z.string(),
});
export const problemMemberSchema = z.object({
  id: z.string(),
  email: z.string().optional(),
  avatarAssetId: z.string().nullable().optional(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

export const problemAssigneeIdsSchema = z
  .array(z.string().min(1).max(100))
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Assignee IDs must be unique",
  });

/** Also reads responses and audit entries written before multiple assignments. */
export function problemAssignees<T extends { id: string }>(problem: {
  assignees?: T[];
  assignee?: T | null;
}): T[] {
  const members = problem.assignees ?? [];
  const legacy = problem.assignee;
  return legacy && !members.some((member) => member.id === legacy.id)
    ? [legacy, ...members]
    : members;
}

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
  coverUrl: z.string().nullable().optional(),
  fleetNumber: z.number().int(),
  model: z.string().nullable(),
  brandName: z.string(),
  brandCode: z.string(),
  registrationNumber: z.string().nullable(),
});
export const problemChecklistItemSchema = z
  .object({
    id: z.string().min(1).max(100),
    text: z.string().trim().min(1).max(300),
    completed: z.boolean(),
  })
  .strict();
export const problemChecklistSchema = z
  .array(problemChecklistItemSchema)
  .max(50)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    {
      message: "Checklist item IDs must be unique",
    },
  );
export const problemSectionSchema = z.enum([
  "checklist",
  "buyList",
  "location",
]);
export const problemSectionsSchema = z
  .array(problemSectionSchema)
  .max(3)
  .refine((items) => new Set(items).size === items.length, {
    message: "Task sections must be unique",
  });
export const businessLocationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    address: z.string().trim().min(1).max(500),
  })
  .strict();
export const businessLocationSchema = businessLocationInputSchema.extend({
  id: z.string(),
});
export const businessLocationListSchema = z.object({
  items: z.array(businessLocationSchema),
});
export const problemLocationSchema = businessLocationInputSchema.extend({
  savedLocationId: z.string().min(1).nullable().default(null),
});
export const problemSchema = z.object({
  id: z.string(),
  scooterId: z.string(),
  scooter: maintenanceScooterSchema,
  title: z.string(),
  description: z.string(),
  checklist: problemChecklistSchema.default([]),
  sections: problemSectionsSchema.default([]),
  buyList: problemChecklistSchema.default([]),
  location: problemLocationSchema.nullable().default(null),
  difficulty: problemDifficultySchema.nullable(),
  legacySeverity: legacyProblemSeveritySchema.nullable().optional(),
  blocksUsage: z.boolean(),
  holdClearedAt: z.string().nullable(),
  photos: z.array(problemPhotoSchema),
  reporter: problemMemberSchema.optional(),
  assignee: problemMemberSchema.nullable(),
  assignees: z.array(problemMemberSchema).optional(),
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
  quickFilterCounts: z
    .object({
      all: z.number().int().nonnegative(),
      open: z.number().int().nonnegative(),
      in_progress: z.number().int().nonnegative(),
      mine: z.number().int().nonnegative(),
      resolved: z.number().int().nonnegative(),
    })
    .optional(),
});
export const listProblemsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    view: z.enum(["assigned", "available", "all"]).optional(),
    status: problemStatusSchema.optional(),
    scooterId: z.string().min(1).optional(),
    difficulty: problemDifficultySchema.optional(),
    assigneeId: z.string().min(1).optional(),
    assigneeIds: z
      .string()
      .max(10_000)
      .transform((value) => value.split(","))
      .pipe(z.array(z.string().trim().min(1).max(100)).min(1).max(100))
      .optional(),
    unassigned: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    blocking: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  })
  .strict();
export const createProblemInputSchema = z
  .object({
    scooterId: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    difficulty: problemDifficultySchema,
    description: z.string().trim().max(4000).default(""),
    blocksUsage: z.boolean().default(false),
    assigneeId: z.string().min(1).nullable().optional(),
    assigneeIds: problemAssigneeIdsSchema.optional(),
    checklist: problemChecklistSchema.optional(),
    sections: problemSectionsSchema.optional(),
    buyList: problemChecklistSchema.optional(),
    location: problemLocationSchema.nullable().optional(),
    photos: z
      .array(problemPhotoDraftSchema)
      .max(PROBLEM_PHOTO_MAX_FILES)
      .default([]),
  })
  .strict()
  .refine(
    (input) =>
      input.assigneeIds === undefined || input.assigneeId === undefined,
    {
      message: "Use assigneeIds or assigneeId, not both",
    },
  );
export const updateProblemInputSchema = revisionInputSchema
  .extend({
    checklist: problemChecklistSchema.optional(),
    sections: problemSectionsSchema.optional(),
    buyList: problemChecklistSchema.optional(),
    location: problemLocationSchema.nullable().optional(),
    photos: z
      .array(problemPhotoDraftSchema)
      .max(PROBLEM_PHOTO_MAX_FILES)
      .optional(),
    workNotes: z.string().trim().max(10000).optional(),
    startWork: z.boolean().optional(),
    pauseWork: z.boolean().optional(),
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(4000).optional(),
    difficulty: problemDifficultySchema.optional(),
  })
  .refine((input) => !(input.startWork && input.pauseWork), {
    message: "Cannot start and pause work together",
  });
export const resolveProblemInputSchema = revisionInputSchema.extend({
  resolutionNotes: z.string().trim().min(1).max(4000),
  /** @deprecated Accepted for older clients; closing always clears this problem’s hold. */
  clearMaintenanceHold: z.boolean().optional(),
});
export const assignProblemInputSchema = revisionInputSchema
  .extend({
    assigneeId: z.string().min(1).nullable().optional(),
    assigneeIds: problemAssigneeIdsSchema.optional(),
  })
  .refine(
    (input) =>
      (input.assigneeIds !== undefined) !== (input.assigneeId !== undefined),
    {
      message: "Provide either assigneeIds or assigneeId",
    },
  );
export const prioritizeProblemInputSchema = revisionInputSchema.extend({
  priority: problemPrioritySchema,
});
export const eligibleAssigneeSchema = problemMemberSchema.extend({
  roles: z.array(z.string()).default([]),
  isSuperAdmin: z.boolean().optional(),
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

export const reopenProblemInputSchema = revisionInputSchema.extend({
  message: z.string().trim().min(1).max(4000),
});
export type ReopenProblemInput = z.infer<typeof reopenProblemInputSchema>;
/** Conversation entries include messages attached to task transitions. */
export const problemConversationTypes = [
  "PROBLEM_COMMENTED",
  "PROBLEM_RESOLVED",
  "PROBLEM_REOPENED",
] as const;

export const closeProblemInputSchema = revisionInputSchema.extend({
  /** @deprecated Accepted for older clients; closing always clears this problem’s hold. */
  clearMaintenanceHold: z.boolean().optional(),
});
export const problemHoldInputSchema = revisionInputSchema.extend({
  blocksUsage: z.boolean(),
});
export const problemCommentInputSchema = revisionInputSchema.extend({
  body: z.string().trim().min(1).max(4000),
});
export const activityQuerySchema = z
  .object({
    kind: z.enum(["comments", "activity"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export const problemActivityTypeSchema = z.enum([
  "PROBLEM_CREATED",
  "PROBLEM_UPDATED",
  "PROBLEM_CLAIMED",
  "PROBLEM_ASSIGNED",
  "PROBLEM_RESOLVED",
  "PROBLEM_REOPENED",
  "PROBLEM_PRIORITIZED",
  "PROBLEM_CANCELLED",
  "PROBLEM_COMMENTED",
  "PROBLEM_HOLD_CHANGED",
]);
export const problemActivityStateSchema = z.object({
  checklist: problemChecklistSchema.optional(),
  sections: problemSectionsSchema.optional(),
  buyList: problemChecklistSchema.optional(),
  location: problemLocationSchema.nullable().optional(),
  status: problemStatusSchema.optional(),
  assigneeId: z.string().nullable().optional(),
  difficulty: problemDifficultySchema.nullable().optional(),
  severity: legacyProblemSeveritySchema.nullable().optional(),
  blocksUsage: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  assignee: problemMemberSchema.nullable().optional(),
  assignees: z.array(problemMemberSchema).optional(),
});
export const problemActivitySchema = z.object({
  id: z.string(),
  type: problemActivityTypeSchema,
  actor: problemMemberSchema.nullable(),
  createdAt: z.string(),
  note: z.string().nullable(),
  before: problemActivityStateSchema.nullable(),
  after: problemActivityStateSchema.nullable(),
});
export const problemActivityListSchema = z.object({
  items: z.array(problemActivitySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const maintenanceHoldSchema = z.object({
  onHold: z.boolean(),
  count: z.number().int().nonnegative(),
  blockers: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: problemStatusSchema,
      difficulty: problemDifficultySchema.nullable(),
    }),
  ),
});
export type ProblemActivity = z.infer<typeof problemActivitySchema>;
export type ProblemPhotoDraft = z.infer<typeof problemPhotoDraftSchema>;
export type ProblemHoldInput = z.infer<typeof problemHoldInputSchema>;
export type ProblemCommentInput = z.infer<typeof problemCommentInputSchema>;
export type CloseProblemInput = z.infer<typeof closeProblemInputSchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

export const problemFilterOptionsSchema = z.object({
  scooters: z.array(maintenanceScooterSchema),
  assignees: z.array(eligibleAssigneeSchema),
});
