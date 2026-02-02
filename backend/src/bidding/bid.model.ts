import { Schema, model, Types } from "mongoose";

const BidSchema = new Schema({
  auctionId: { type: Types.ObjectId, ref: "Auction", required: true },
  bidderId: { type: Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

BidSchema.index({ auctionId: 1, timestamp: -1 });
BidSchema.index({ bidderId: 1, timestamp: -1 });

export const Bid = model("Bid", BidSchema);