import { Schema, model } from 'mongoose';
import { z } from 'zod';

export const ROLES = ['USER', 'AUCTIONEER'] as const;
export type Role = (typeof ROLES)[number];

// Canonical validator (reuse everywhere)
export const RoleSchema = z.enum(ROLES);

const UserSchema = new Schema(
  {
    username: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ROLES,
      required: true,
    },
    walletId: {
      type: Schema.Types.ObjectId,
      ref: 'Wallet',
      unique: true,
    },
    
  },
  { timestamps: true }
);

export const User = model('User', UserSchema);
