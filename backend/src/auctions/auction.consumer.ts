import { rabbitmq } from '../config/rabbitmq.js';
import { startAuction, endAuction } from './auction.scheduler.js';
import { Types } from 'mongoose';
import { Auction } from './auction.model.js';

export async function startAuctionWorker() {
  const channel = rabbitmq.getChannel();

  console.log('[AUCTION WORKER] Starting auction workers...');

  // Worker 1: Process auction start
  await channel.consume(
    'auction-start',
    async (msg) => {
      if (!msg) return;

      try {
        const { auctionId } = JSON.parse(msg.content.toString());
        console.log(`[AUCTION WORKER] Starting auction ${auctionId}`);

        if (!Types.ObjectId.isValid(auctionId)) {
          console.error(`[AUCTION WORKER] Invalid auction ID: ${auctionId}`);
          channel.ack(msg);
          return;
        }

        const auction = await Auction.findById(auctionId);
        if (!auction || auction.status !== 'SCHEDULED') {
          console.warn(`[AUCTION WORKER] Auction ${auctionId} cannot be started`);
          channel.ack(msg);
          return;
        }

        await startAuction(new Types.ObjectId(auctionId));
        console.log(`[AUCTION WORKER] Auction ${auctionId} started`);

        channel.ack(msg);
      } catch (error) {
        console.error('[AUCTION WORKER] Failed to start auction:', error);
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  console.log('[AUCTION WORKER] Auction workers ready');
}