import { z } from 'zod';

export const createAuctionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  basePrice: z.coerce.number().positive('Base price must be positive'),
  minIncrement: z.coerce.number().positive('Minimum increment must be positive').optional(),
  startTime: z.coerce.date().refine((d) => d.getTime() > Date.now(), { message: "Start time must be in the future" }),  
  endTime: z.coerce.date().refine((d) => d.getTime() > Date.now(), { message: "End time must be in the future" }),

}).refine(
  (data) => data.endTime > data.startTime,
  {
    message: "endTime must be greater than startTime",
    path: ["endTime"], // attaches error to endTime field
  }
);;

export const getAuctionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().default(10).optional(),
  status: z.enum(['SCHEDULED', 'LIVE', 'ENDED']).default('LIVE').optional(),
});
