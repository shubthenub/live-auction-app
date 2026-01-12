import { Schema, model, Types } from 'mongoose';

export type AuctionStatus = 'SCHEDULED' | 'LIVE' | 'ENDED';

const AuctionSchema = new Schema(
  {
    // ---- Core info ----
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    images: [
      {
        url: { type: String, required: true },
        order: { type: Number, default: 0 },
      },
    ],

    // ---- Pricing ----
    basePrice: {
      type: Number,
      required: true,
      min: 1,
    },

    minIncrement: {
      type: Number,
      default: 10,
      min: 1,
    },

    // ---- Timing ----
    startTime: {
      type: Date,
      required: true,
    },

    endTime: {
      type: Date,
      required: true,
    },

    // ---- State ----
    status: {
      type: String,
      enum: ['SCHEDULED', 'LIVE', 'ENDED'],
      default: 'SCHEDULED',
      index: true,
    },

    // ---- Ownership ----
    createdBy: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ---- Result (filled after end) ----
    winnerUserId: {
      type: Types.ObjectId,
      ref: 'User',
    },

    finalPrice: {
      type: Number,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

AuctionSchema.index({ startTime: 1 });
AuctionSchema.index({ endTime: 1 });

export const Auction = model('Auction', AuctionSchema);

