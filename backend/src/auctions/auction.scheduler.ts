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
      await transferBalance(winnerId, auction.createdBy, finalPrice);
    } else {
      console.log(`[AUCTION] Auction ${auctionId} ended with NO winner — no bids were placed or final price was ${auction.basePrice}.`);
    }

    // Update auction status with session
    auction.status = "ENDED";
    auction.finalPrice = finalPrice;
    auction.winnerUserId = winnerId;
    auction.endTime = new Date();
    await auction.save(); 

    // Release locked balance in Redis (after transaction commits)
    if (winnerId) {
      await releaseLockedBalance(winnerId, finalPrice);
    }

    const io = getIO();
    // Unlock all non-winning bidders in this auction room
    const sockets = io.sockets.adapter.rooms.get(`auction:${auctionId.toString()}`);
    if (sockets) {
      for (const socketId of sockets) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket && socket.data.user?.id !== winnerId) {
          // Unlock non-winning user's wallet
          await redis.hset(`wallet:${socket.data.user.id}`, 'locked', '0');
        }
      }
    }
    io.to(`auction:${auctionId.toString()}`).emit("auctionEnded", {
      auctionId: auction.id,
      finalPrice,
      winnerId,
    });

    // Kick all sockets out of the auction room
    const roomSockets = await io.in(`auction:${auctionId.toString()}`).fetchSockets();
    for (const s of roomSockets) {
      s.leave(`auction:${auctionId.toString()}`);
      s.data.auctionId = null; // clear so disconnect handler doesn't try wallet cleanup
    }
    // Clean up Redis auction data (timer key already expired, just delete data key)
    await redis.del(`auction:data:${auctionId.toString()}`);
    await redis.del(`auction:timer:${auctionId.toString()}`); 

    console.log("Auction ended:", auction.id);
  } catch (error: any) {
    console.error("Error ending auction:", error);
    throw error;
  }
}
