import { rabbitmq } from "../config/rabbitmq.js";
import { Bid } from "./bid.model.js";

const BATCH_SIZE = 200;
const BATCH_TIMEOUT = 2000;
const MAX_RETRIES = 3;

let batchBuffer: any[] = [];
let batchTimer: NodeJS.Timeout | null = null;
let isFlushingInProgress = false;
let isShuttingDown = false;

async function flushBatch() {
  if (batchBuffer.length === 0 || isFlushingInProgress) return;

  isFlushingInProgress = true;
  const bidsToInsert = [...batchBuffer];
  batchBuffer = [];

  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      await Bid.insertMany(bidsToInsert, { ordered: false });
      console.log(`[BID WORKER] Inserted ${bidsToInsert.length} bids`);
      isFlushingInProgress = false;
      return;
    } catch (error: any) {
      retries++;
      console.error(`[BID WORKER] Batch insert failed (attempt ${retries}/${MAX_RETRIES}):`, error.message);
      if (retries >= MAX_RETRIES) {
        console.error("[BID WORKER] CRITICAL: Batch insert failed after max retries");
        console.error("[BID WORKER] Failed bids:", JSON.stringify(bidsToInsert));
        // Send to dead-letter queue for manual review
        await sendToDeadLetterQueue(bidsToInsert);
        isFlushingInProgress = false;
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)));
    }
  }
}

async function sendToDeadLetterQueue(bids: any[]) {
  try {
    const channel = rabbitmq.getChannel();
    if (channel) {
      channel.sendToQueue("bid-audit-dlq", Buffer.from(JSON.stringify(bids)));
    }
  } catch (error) {
    console.error("[BID WORKER] Failed to send to DLQ:", error);
  }
}

export async function startBidConsumer() {
  const channel = rabbitmq.getChannel();
  if (!channel) throw new Error("[BID WORKER] RabbitMQ not connected");

  channel.consume("bid-audit", async (msg: any) => {
    if (!msg) return;

    try {
      const bidData = JSON.parse(msg.content.toString());

      batchBuffer.push({
        auctionId: bidData.auctionId,
        bidderId: bidData.bidderId,
        amount: bidData.amount,
        timestamp: bidData.timestamp || new Date(),
      });

      // Only ACK after successful DB insert
      if (batchBuffer.length >= BATCH_SIZE) {
        if (batchTimer) {
          clearTimeout(batchTimer);
          batchTimer = null;
        }
        await flushBatch();
      } else if (!batchTimer) {
        batchTimer = setTimeout(() => {
          batchTimer = null;
          flushBatch();
        }, BATCH_TIMEOUT);
      }

      channel.ack(msg);
    } catch (error) {
      console.error("[BID WORKER] Consumer error:", error);
      channel.nack(msg, false, true);
    }
  });

  console.log("[BID WORKER] Bid consumer started");
}

async function gracefulShutdown() {
  isShuttingDown = true;
  console.log("[BID WORKER] Flushing remaining bids...");
  if (batchTimer) clearTimeout(batchTimer);
  
  while (isFlushingInProgress || batchBuffer.length > 0) {
    await flushBatch();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  
  console.log("[BID WORKER] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);