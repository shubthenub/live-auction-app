import amqp, { Channel } from "amqplib";
import { env } from "./env.js";
//QUEUE CREATION IS IDEMPOTENT - AUTOMATIC DEDUPLICATION 


class RabbitMQ {
  private connection: any = null;
  private channel: any = null;
  private readonly BID_QUEUE_NAME = "bid-audit";
  private readonly BID_DLQ_NAME = "bid-audit-dlq"; 
  private readonly AUCTION_SCHEDULER_DLQ_NAME = "auction-scheduler-dlq";

  async connect(): Promise<void> {
    this.connection = await amqp.connect(env.RABBITMQ_URL);
    this.channel = await this.connection.createChannel();
    
    // Try to use existing queue without changing its args
    try {
      await this.channel.checkQueue(this.BID_QUEUE_NAME);
      console.log("[RABBITMQ] Bid audit queue exists, using it as-is");
    } catch {
      // Queue doesn't exist: create it with DLQ
      await this.channel.assertQueue(this.BID_DLQ_NAME, { durable: true });
      await this.channel.assertQueue(this.BID_QUEUE_NAME, {
        durable: true,
        deadLetterExchange: "",
        deadLetterRoutingKey: this.BID_DLQ_NAME,
      });
      console.log("Bid audit Queue created with DLQ");
    }

    // Setup Auction Scheduler DLQ and delay queue
    // 1. Create DLX
    await this.channel.assertExchange('auction-dlx', 'direct', {
      durable: true,
    });

    // 2. Create final work queue
    await this.channel.assertQueue('auction-start', {
      durable: true,
    });

    // 3. Bind work queue to DLX
    await this.channel.bindQueue('auction-start', 'auction-dlx', 'start');

    // 4. Create delay queue (routes to DLX after TTL) ----- this was replaced by one queue per auction strategy
    // await this.channel.assertQueue('auction-start-delay', {
    //   durable: true,
    //   deadLetterExchange: 'auction-dlx',
    //   deadLetterRoutingKey: 'start',
    // });
    
    await this.channel.prefetch(100);
    console.log("[RABBITMQ] Auction Scheduler connected with DLQ");
  }

  // Fire-and-forget 
  publishBid(bidData: any): void {
    if (!this.channel) {
      console.error("RabbitMQ channel not initialized - bid audit skipped");
      return;
    }

    try {
      const sent = this.channel.sendToQueue(
        this.BID_QUEUE_NAME,
        Buffer.from(JSON.stringify(bidData)),
        {
          persistent: true,
          timestamp: Date.now(),
        }
      );
      
      if (!sent) {
        console.warn("Queue full - message buffered");
      }
    } catch (error) {
      console.error("Failed to publish bid audit:", error);
    }
  }

  getChannel(): Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    return this.channel;
  }

  
  // Schedule auction start using TTL --> v2-> one queue per auction 
  async scheduleAuctionStart(auctionId: string, startTime: Date) {
    const channel = this.getChannel();
    const delay = new Date(startTime).getTime() - Date.now();
    if (delay <= 0) throw new Error('Start time must be in the future');
    const delayQueueName = `auction-start-delay:${auctionId}`;
    await channel.assertQueue(delayQueueName, {
      durable: true,
      deadLetterExchange: 'auction-dlx',
      deadLetterRoutingKey: 'start',
      messageTtl: delay,        // queue-level TTL → no head-of-queue bias
      expires: delay + 60_000,  // auto-delete the temp queue 60s after it fires
    });
    channel.sendToQueue(
      delayQueueName,
      Buffer.from(JSON.stringify({ auctionId })),
      { persistent: true }      // NO per-message expiration — let queue TTL drive it
    );
    console.log(`📅 Scheduled auction ${auctionId} in ${Math.round(delay / 1000)}s via dedicated queue`);
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}

export const rabbitmq = new RabbitMQ();


// ┌─────────────────┐
// │   RabbitMQ      │  ← Always accepting (independent)
// │   Queue         │
// └────────┬────────┘
//          │ Messages keep coming in
//          ↓
// ┌─────────────────┐
// │  Consumer       │
// │  batchBuffer[]  │  ← Collecting messages
// └─────────────────┘
//          │
//          ↓ When buffer reaches 200 or 2sec timeout
// ┌─────────────────┐
// │  flushBatch()   │  ← Writing to MongoDB
// │  (async)        │
// └─────────────────┘
//          │
//          ↓
//     MongoDB
