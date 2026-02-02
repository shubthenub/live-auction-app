import amqp from "amqplib";
import { env } from "./env.js";

class RabbitMQ {
  private connection: any = null;
  private channel: any = null;
  private readonly QUEUE_NAME = "bid-audit";
  private readonly DLQ_NAME = "bid-audit-dlq"; 

  async connect(): Promise<void> {
    this.connection = await amqp.connect(env.RABBITMQ_URL);
    this.channel = await this.connection.createChannel();
    
    // Try to use existing queue without changing its args
    try {
      await this.channel.checkQueue(this.QUEUE_NAME);
      console.log("Queue exists, using it as-is");
    } catch {
      // Queue doesn't exist: create it with DLQ
      await this.channel.assertQueue(this.DLQ_NAME, { durable: true });
      await this.channel.assertQueue(this.QUEUE_NAME, {
        durable: true,
        deadLetterExchange: "",
        deadLetterRoutingKey: this.DLQ_NAME,
      });
      console.log("Queue created with DLQ");
    }
    
    await this.channel.prefetch(100);
    console.log("RabbitMQ connected with DLQ");
  }

  // Fire-and-forget but with error logging
  publishBid(bidData: any): void {
    if (!this.channel) {
      console.error("RabbitMQ channel not initialized - bid audit skipped");
      return;
    }

    try {
      const sent = this.channel.sendToQueue(
        this.QUEUE_NAME,
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

  getChannel(): any {
    return this.channel;
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
