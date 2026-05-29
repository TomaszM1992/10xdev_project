import { z } from "zod";

export const CreateTaskSchema = z.object({
  name: z.string().min(1).max(255),
  target_date: z.iso.date(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  time_estimate_minutes: z.number().int().positive(),
  tags: z.array(z.string().min(1).max(50)).max(5).default([]),
});

export const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  target_date: z.iso.date().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  time_estimate_minutes: z.number().int().positive().optional(),
  tags: z.array(z.string().min(1).max(50)).max(5).optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
