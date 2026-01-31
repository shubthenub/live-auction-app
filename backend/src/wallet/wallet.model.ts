import { Schema, model, Types } from 'mongoose';

const walletSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: 'User',
      unique: true,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    locked: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

export const Wallet = model('Wallet', walletSchema);
