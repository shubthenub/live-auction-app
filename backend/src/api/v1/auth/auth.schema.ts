import { z } from 'zod';
import { RoleSchema } from '@/users/user.model';

export const registerSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  email: z.string().email({ message: 'Email already exists' }),
  password: z.string().min( 6, 'Password must be at least 6 characters long'),
  role: RoleSchema,
});

export const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(3),
});
