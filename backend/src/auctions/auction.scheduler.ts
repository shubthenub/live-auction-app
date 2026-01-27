import { Auction } from './auction.model.js';
import { getIO } from '../ws/socket.js';
import { Types } from 'mongoose';
import { initLiveAuction } from '../bidding/liveAuction.service.js';

export async function startAuction(auctionId: Types.ObjectId) {
  const auction = await Auction.findById(auctionId);

  if (!auction) {
    throw new Error('Auction not found');
  }

  if (auction.status === 'ENDED'){
    throw new Error('Auction has Ended');
  }

  if (auction.status !== 'SCHEDULED') {
    throw new Error('Auction not scheduled');
  }

  await initLiveAuction(auction.id, auction.basePrice, auction.endTime);
  

  auction.status = 'LIVE';
  await auction.save();

  const io = getIO();
  io.emit('auctionStarted', {
    auctionId: auction.id,
  });

  console.log('Auction started:', auction.id);
}

export async function endAuction(
  auctionId: Types.ObjectId,
  finalPrice: number,
  winnerId: Types.ObjectId | null
) {
  const auction = await Auction.findById(auctionId);

  if (!auction) {
    throw new Error('Auction not found');
  }

  if (auction.status !== 'LIVE') {
    throw new Error('Auction is not live');
  }

  auction.status = 'ENDED';
  auction.finalPrice = finalPrice;
  auction.winnerUserId = winnerId;
  auction.endTime = new Date();

  await auction.save();

  const io = getIO();
  io.to(`auction:${auctionId.toString()}`).emit('auctionEnded', {
    auctionId: auction.id,
    finalPrice,
    winnerId,
  });

  console.log('Auction ended:', auction.id);
}