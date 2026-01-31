 import { Schema, model } from 'mongoose';

export type Role = 'USER' | 'AUCTIONEER';

const UserSchema = new Schema(
  {
    username: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['USER', 'AUCTIONEER'],
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
