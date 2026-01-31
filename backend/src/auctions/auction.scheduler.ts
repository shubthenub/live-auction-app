import { Auction } from "./auction.model.js";
import { getIO } from "../ws/socket.js";
import { startSession, Types } from "mongoose";
import { initLiveAuction } from "../bidding/liveAuction.service.js";
import { redis } from "../config/redis.js";
import { User } from "../users/user.model.js";
import { Wallet } from "../wallet/wallet.model.js";
import { releaseLockedBalance, transferBalance } from "../wallet/wallet.service.js";

export async function startAuction(auctionId: Types.ObjectId) {
  const auction = await Auction.findById(auctionId);

  if (!auction) {
    throw new Error("Auction not found");
  }

  if (auction.status === "ENDED") {
    throw new Error("Auction has Ended");
  }

  if (auction.status !== "SCHEDULED") {
    throw new Error("Auction not scheduled");
  }

  await initLiveAuction(auction.id, auction.basePrice, auction.endTime);

  auction.status = "LIVE";
  await auction.save();

  const io = getIO();
  io.emit("auctionStarted", {
    auctionId: auction.id,
  });

  console.log("Auction started:", auction.id);
}

export async function endAuction(
  auctionId: Types.ObjectId,
  finalPrice: number,
  winnerId: Types.ObjectId | null,
) {
  const session = await startSession();
  session.startTransaction();
  try {
    const auction = await Auction.findById(auctionId);

    if (!auction) {
      throw new Error("Auction not found");
    }

    if (auction.status !== "LIVE") {
      throw new Error("Auction is not live");
    }

    // Transfer balance from winner to auctioneer
    if (winnerId && finalPrice > 0) {
      await transferBalance(winnerId, auction.createdBy, finalPrice, session);
    }

    // Update auction status with session
    auction.status = "ENDED";
    auction.finalPrice = finalPrice;
    auction.winnerUserId = winnerId;
    auction.endTime = new Date();
    await auction.save({ session }); 

    await session.commitTransaction();

    // Release locked balance in Redis (after transaction commits)
    if (winnerId) {
      await releaseLockedBalance(winnerId, finalPrice);
    }

    const io = getIO();
    io.to(`auction:${auctionId.toString()}`).emit("auctionEnded", {
      auctionId: auction.id,
      finalPrice,
      winnerId,
    });

    console.log("Auction ended:", auction.id);
  } catch (error) {
    await session.abortTransaction();
    console.error("Error ending auction:", error);
  } finally {
    session.endSession();
  }
}
