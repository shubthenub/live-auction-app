import { Types } from 'mongoose';
import { endAuction } from '../auctions/auction.scheduler.js';
import { redis } from '../config/redis.js';
import fs from 'fs';
import { rabbitmq } from '../config/rabbitmq.js';

const ROUND_DURATION_MS = 60000;
let subscriber: ReturnType<typeof redis.duplicate> | null = null;

async function initSubscriber() {
  if (subscriber) {
    console.log('Subscriber already initialized');
    return subscriber;
  }

  subscriber = redis.duplicate();
  // await subscriber.connect();

  console.log(' Subscriber connected');

  subscriber.on('ready', () => {
    console.log('Subscriber ready');
  });

  subscriber.on('error', (err) => {
    console.error('[SUBSCRIBER] Error:', err);
  });

  
  subscriber.on('message', async (channel, message) => {
  // Check if the TIMER expired
  if (message.startsWith('auction:timer:')) {
    console.log(`[TIMER EXPIRED] ${message}`);
    const auctionIdStr = message.replace('auction:timer:', '');
    const dataKey = `auction:data:${auctionIdStr}`;

    const finalState = await redis.hgetall(dataKey);
    console.log(`[FINAL STATE] ${dataKey}:`, finalState);

    if (finalState && Object.keys(finalState).length > 0) {
      const currentPrice = parseFloat(finalState.currentPrice || '0');
      const winnerId = finalState.highestBidderId ? new Types.ObjectId(finalState.highestBidderId) : null;

      console.log(`[ENDING AUCTION] ${auctionIdStr}, Price: ${currentPrice}, Winner: ${winnerId}`);
      await endAuction(new Types.ObjectId(auctionIdStr), currentPrice, winnerId);
      await redis.del(dataKey);
    }
  }
});
  try {
    await subscriber.subscribe(`__keyevent@0__:expired`);
    console.log('Subscribed to __keyevent@0__:expired');
  } catch (err) {
    console.error('Failed to subscribe:', err);
    throw err;
  }

  return subscriber;
}

export async function initLiveAuction(
  auctionId: string | { toString(): string },
  basePrice: number,
  endTime: Date
) {
  const now = Date.now();
  const initialEnd = endTime.getTime();
  const ttl = Math.max(0, initialEnd - now);
  const auctionIdStr = typeof auctionId === 'string' ? auctionId : auctionId.toString();

  //store data 
  await redis.hset(`auction:data:${auctionIdStr}`, {
    currentPrice: basePrice.toString(),
    highestBidderId: '',
    status: 'LIVE',
  });

  //Store timer seperately
  await redis.set(`auction:timer:${auctionIdStr}`, 'active', 'PX', ROUND_DURATION_MS);

  await redis.pexpire(`auction:${auctionIdStr}`, ROUND_DURATION_MS ); 
  console.log("Redis auction ended at (ms):", ttl);

  await initSubscriber();
}


export async function getLiveAuctionState(auctionId: string | { toString(): string }) {
  const auctionIdStr = auctionId.toString();
  
  const data = await redis.hgetall(`auction:data:${auctionIdStr}`);

  if (!data || Object.keys(data).length === 0) return null;

  const timerExists = await redis.exists(`auction:timer:${auctionIdStr}`);

  return {
    currentPrice: Number(data.currentPrice),
    highestBidderId: data.highestBidderId || null,
    hasFirstBid: data.hasFirstBid === '1',
    roundEndsAt: Number(data.roundEndsAt),
    initialEndTime: Number(data.initialEndTime),
    serverTime: Date.now(),
    isLive: timerExists === 1 
  };
}





type PlaceBidResult = [number, string, number];
const lua = fs.readFileSync('src/bidding/placeBid.lua', 'utf8');
export async function placeBid(
  auctionId: string,
  amount: number,
  bidderId: string,
  minIncrement: number
) {
  const auctionState = await getLiveAuctionState(auctionId);
  
  if (!auctionState || !auctionState.isLive) {
    throw new Error("Auction is not live");
  }

  if(bidderId === auctionState.highestBidderId) {
    return{
      success: false,
      message: "You are already the highest bidder",
    }
  }

  const res = await redis.eval(
    lua,
    3, //number of keys
    `auction:data:${auctionId}`,  // KEYS[1]
    `auction:timer:${auctionId}`, // KEYS[2]
    `wallet:${bidderId}`,    // KEYS[3]
    amount,
    bidderId,
    Date.now(),
    minIncrement,
    60000
  ) as PlaceBidResult;

  // Only publish if roundEndsAt = 0 signals change)
  if (res[2] != 0) {
    try {
      rabbitmq.publishBid({
        auctionId,
        bidderId,
        amount,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Failed to publish bid to queue:", error);
    }
  }

  return {
    currentPrice: res[0],
    highestBidderId: res[1],
    roundEndsAt: res[2],
  };
}
