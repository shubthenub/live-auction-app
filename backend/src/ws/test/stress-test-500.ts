import { io, Socket } from 'socket.io-client';
import { testUsers, TestUser } from './testUsers.js';

interface BidResult {
  userId: string;
  amount: number;
  timestamp: number;
  success: boolean;
  accepted: boolean;
  error?: string;
  latency?: number;
}

interface TestMetrics {
  totalBids: number;
  successfulBids: number;
  acceptedBids: number;
  rejectedBids: number;
  failedBids: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  concurrentUsers: number;
  testDuration: number;
  bidsPerSecond: number;
  rejectedBreakdown: Record<string, number>;
  failedBreakdown: Record<string, number>;
}

class MassiveBiddingStressTest {
  private auctionId: string;
  private baseUrl: string;
  private sockets: Map<string, Socket> = new Map();
  private bidResults: BidResult[] = [];
  private connectedUsers = 0;
  private startTime = 0;
  private endTime = 0;
  private currentPrice = 1000;
  private validationErrors = new Set([
    'Bid must be higher than current price',
    'Bid increment too small',
    'Insufficient available balance',
    'You are already the highest bidder',
  ]);

  constructor(auctionId: string, baseUrl: string = 'http://localhost:3000') {
    this.auctionId = auctionId;
    this.baseUrl = baseUrl;
  }

  /**
   * Connect all 500 users
   */
  private async connectUser(user: TestUser): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = io(this.baseUrl, {
        auth: { token: user.token },
        reconnection: false,
        timeout: 10000,
      });

      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error(`Connection timeout for ${user.username}`));
      }, 10000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        this.connectedUsers++;
        
        socket.emit('joinAuction', { auctionId: this.auctionId });
      });

      socket.on('auctionState', () => {
        this.sockets.set(user.id, socket);
        resolve();
      });

      socket.on('bidUpdate', (data) => {
        if (data.currentPrice > this.currentPrice) {
          this.currentPrice = data.currentPrice;
        }
      });

      socket.on('error', (err) => {
        console.error(`❌ [${user.username}] Socket error:`, err);
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Place a bid and measure latency
   */
  private async placeBid(userId: string, amount: number): Promise<BidResult> {
    const socket = this.sockets.get(userId);
    if (!socket) {
      return {
        userId,
        amount,
        timestamp: Date.now(),
        success: false,
        accepted: false,
        error: 'Socket not found',
      };
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          userId,
          amount,
          timestamp: startTime,
          success: false,
          accepted: false,
          error: 'Bid timeout',
          latency: Date.now() - startTime,
        });
      }, 5000);

      socket.emit('placeBid', { auctionId: this.auctionId, amount });

      // Listen for success (bidUpdate event)
      const onBidUpdate = (data: any) => {
        if (data.highestBidderId === userId && data.currentPrice === amount) {
          clearTimeout(timeout);
          socket.off('bidUpdate', onBidUpdate);
          socket.off('bidError', onBidError);
          resolve({
            userId,
            amount,
            timestamp: startTime,
            success: true,
            accepted: true,
            latency: Date.now() - startTime,
          });
        }
      };

      // Listen for error
      const onBidError = (error: string) => {
        const isValidation = this.validationErrors.has(error);
        clearTimeout(timeout);
        socket.off('bidUpdate', onBidUpdate);
        socket.off('bidError', onBidError);
        resolve({
          userId,
          amount,
          timestamp: startTime,
          success: isValidation,
          accepted: false,
          error,
          latency: Date.now() - startTime,
        });
      };

      socket.on('bidUpdate', onBidUpdate);
      socket.on('bidError', onBidError);
    });
  }

  /**
   * Test 1: Sequential bidding (baseline)
   */
  async testSequentialBidding(numBids: number = 100) {
    console.log(`\n🧪 TEST 1: Sequential Bidding (${numBids} bids)`);
    console.log('═'.repeat(60));

    let amount = this.currentPrice + 100;

    for (let i = 0; i < numBids; i++) {
      const user = testUsers[i % testUsers.length];
      amount += 100;

      const result = await this.placeBid(user.id, amount);
      this.bidResults.push(result);

      if ((i + 1) % 20 === 0) {
        console.log(`  Processed ${i + 1}/${numBids} bids...`);
      }
    }

    console.log('✅ Sequential test completed');
  }

  /**
   * Test 2: Concurrent bidding waves
   */
  async testConcurrentWaves(wavesCount: number = 10, bidsPerWave: number = 50) {
    console.log(`\n🧪 TEST 2: Concurrent Waves (${wavesCount} waves, ${bidsPerWave} bids/wave)`);
    console.log('═'.repeat(60));

    let amount = this.currentPrice + 100;

    for (let wave = 0; wave < wavesCount; wave++) {
      const promises: Promise<BidResult>[] = [];
      
      for (let i = 0; i < bidsPerWave; i++) {
        const userIndex = (wave * bidsPerWave + i) % testUsers.length;
        const user = testUsers[userIndex];
        amount += 100;

        promises.push(this.placeBid(user.id, amount));
      }

      const results = await Promise.all(promises);
      this.bidResults.push(...results);

      const handled = results.filter(r => r.success).length;
      console.log(`  Wave ${wave + 1}: ${handled}/${bidsPerWave} handled`);

      // Small delay between waves
      await this.sleep(500);
    }

    console.log('✅ Concurrent waves test completed');
  }

  /**
   * Test 3: Race condition - all users bid at exact same time
   */
  async testMassiveRaceCondition(participants: number = 500) {
    console.log(`\n🧪 TEST 3: Massive Race Condition (${participants} simultaneous bids)`);
    console.log('═'.repeat(60));

    const amount = this.currentPrice + 1000;
    const fireTime = Date.now() + 1000; // Fire in 1 second

    console.log(`⏱️  Scheduling ${participants} bids to fire at: ${new Date(fireTime).toISOString()}`);

    const promises: Promise<BidResult>[] = [];

    for (let i = 0; i < Math.min(participants, testUsers.length); i++) {
      const user = testUsers[i];
      const delay = Math.max(0, fireTime - Date.now());

      promises.push(
        new Promise(async (resolve) => {
          await this.sleep(delay);
          const result = await this.placeBid(user.id, amount);
          resolve(result);
        })
      );
    }

    const results = await Promise.all(promises);
    this.bidResults.push(...results);

    const accepted = results.filter(r => r.accepted).length;
    console.log(`🔥 Results: ${accepted} winners, ${participants - accepted} losers`);
    console.log('✅ Race condition test completed');
  }

  /**
   * Test 4: Sustained high-frequency bidding
   */
  async testHighFrequencyBidding(durationSeconds: number = 30) {
    console.log(`\n🧪 TEST 4: High-Frequency Sustained Bidding (${durationSeconds}s)`);
    console.log('═'.repeat(60));

    const startTime = Date.now();
    const endTime = startTime + durationSeconds * 1000;
    let bidCount = 0;

    while (Date.now() < endTime) {
      const user = testUsers[bidCount % testUsers.length];
      const amount = this.currentPrice + 100 + Math.floor(Math.random() * 100);

      const result = await this.placeBid(user.id, amount);
      this.bidResults.push(result);
      bidCount++;

      // No delay - fire as fast as possible
      if (bidCount % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  ${bidCount} bids in ${elapsed}s (${(bidCount / parseFloat(elapsed)).toFixed(1)} bids/s)`);
      }
    }

    console.log(`✅ High-frequency test completed: ${bidCount} bids`);
  }

  /**
   * Test 5: Random burst patterns
   */
  async testRandomBursts(bursts: number = 20) {
    console.log(`\n🧪 TEST 5: Random Burst Patterns (${bursts} bursts)`);
    console.log('═'.repeat(60));

    for (let burst = 0; burst < bursts; burst++) {
      const burstSize = Math.floor(Math.random() * 50) + 10;
      const promises: Promise<BidResult>[] = [];

      for (let i = 0; i < burstSize; i++) {
        const user = testUsers[Math.floor(Math.random() * testUsers.length)];
        const amount = this.currentPrice + 100 + Math.floor(Math.random() * 500);
        promises.push(this.placeBid(user.id, amount));
      }

      const results = await Promise.all(promises);
      this.bidResults.push(...results);

      const handled = results.filter(r => r.success).length;
      console.log(`  Burst ${burst + 1}: ${burstSize} bids, ${handled} handled`);

      // Random delay between bursts
      await this.sleep(Math.random() * 2000 + 500);
    }

    console.log('✅ Random burst test completed');
  }

  /**
   * Calculate test metrics
   */
  private calculateMetrics(): TestMetrics {
    const successfulBids = this.bidResults.filter(r => r.success);
    const acceptedBids = this.bidResults.filter(r => r.accepted);
    const rejectedBids = successfulBids.filter(r => !r.accepted);
    const failedBids = this.bidResults.filter(r => !r.success);
    const latencies = this.bidResults.filter(r => r.latency).map(r => r.latency!);

    const rejectedBreakdown: Record<string, number> = {};
    rejectedBids.forEach(bid => {
      const error = bid.error || 'Unknown';
      rejectedBreakdown[error] = (rejectedBreakdown[error] || 0) + 1;
    });

    const failedBreakdown: Record<string, number> = {};
    failedBids.forEach(bid => {
      const error = bid.error || 'Unknown';
      failedBreakdown[error] = (failedBreakdown[error] || 0) + 1;
    });

    return {
      totalBids: this.bidResults.length,
      successfulBids: successfulBids.length,
      acceptedBids: acceptedBids.length,
      rejectedBids: rejectedBids.length,
      failedBids: failedBids.length,
      averageLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
      maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
      concurrentUsers: this.connectedUsers,
      testDuration: (this.endTime - this.startTime) / 1000,
      bidsPerSecond: this.bidResults.length / ((this.endTime - this.startTime) / 1000),
      rejectedBreakdown,
      failedBreakdown,
    };
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    try {
      console.log('\n🚀 MASSIVE BIDDING STRESS TEST - 500 USERS');
      console.log('═'.repeat(60));
      console.log(`Auction ID: ${this.auctionId}`);
      console.log(`Total Users: ${testUsers.length}`);
      console.log(`Base URL: ${this.baseUrl}`);
      console.log('═'.repeat(60));

      this.startTime = Date.now();

      // Phase 1: Connect all users
      console.log('\n📱 Phase 1: Connecting 500 users...');
      const batchSize = 50;
      for (let i = 0; i < testUsers.length; i += batchSize) {
        const batch = testUsers.slice(i, i + batchSize);
        await Promise.all(batch.map((user: TestUser) => this.connectUser(user).catch(err => {
          console.error(`Failed to connect ${user.username}:`, err.message);
        })));
        console.log(`  Connected ${Math.min(i + batchSize, testUsers.length)}/${testUsers.length} users`);
        await this.sleep(1000);
      }

      console.log(`✅ ${this.connectedUsers} users connected successfully\n`);
      await this.sleep(3000);

      // Phase 2: Run tests
      await this.testSequentialBidding(100);
      await this.sleep(2000);

      await this.testConcurrentWaves(10, 50);
      await this.sleep(2000);

      await this.testMassiveRaceCondition(500);
      await this.sleep(2000);

      await this.testHighFrequencyBidding(30);
      await this.sleep(2000);

      await this.testRandomBursts(20);

      this.endTime = Date.now();

      // Print results
      this.printResults();

      // Cleanup
      this.cleanup();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      this.cleanup();
    }
  }

  /**
   * Print detailed results
   */
  private printResults() {
    const metrics = this.calculateMetrics();

    console.log('\n\n📊 COMPREHENSIVE TEST RESULTS');
    console.log('═'.repeat(60));
    console.log(`\n⏱️  Test Duration: ${metrics.testDuration.toFixed(2)}s`);
    console.log(`👥 Concurrent Users: ${metrics.concurrentUsers}`);
    console.log(`\n📈 Bid Statistics:`);
    console.log(`   Total Bids: ${metrics.totalBids}`);
    console.log(`   Handled (accepted + validation rejects): ${metrics.successfulBids} (${((metrics.successfulBids / metrics.totalBids) * 100).toFixed(2)}%)`);
    console.log(`   Accepted: ${metrics.acceptedBids} (${((metrics.acceptedBids / metrics.totalBids) * 100).toFixed(2)}%)`);
    console.log(`   Rejected (validation): ${metrics.rejectedBids} (${((metrics.rejectedBids / metrics.totalBids) * 100).toFixed(2)}%)`);
    console.log(`   Failed: ${metrics.failedBids} (${((metrics.failedBids / metrics.totalBids) * 100).toFixed(2)}%)`);
    console.log(`   Bids/Second: ${metrics.bidsPerSecond.toFixed(2)}`);
    
    console.log(`\n⚡ Latency (ms):`);
    console.log(`   Average: ${metrics.averageLatency.toFixed(2)}ms`);
    console.log(`   Min: ${metrics.minLatency}ms`);
    console.log(`   Max: ${metrics.maxLatency}ms`);

    if (Object.keys(metrics.rejectedBreakdown).length > 0) {
      console.log(`\n⚠️  Rejected Breakdown (validation):`);
      Object.entries(metrics.rejectedBreakdown).forEach(([error, count]) => {
        console.log(`   ${error}: ${count}`);
      });
    }

    if (Object.keys(metrics.failedBreakdown).length > 0) {
      console.log(`\n❌ Failed Breakdown:`);
      Object.entries(metrics.failedBreakdown).forEach(([error, count]) => {
        console.log(`   ${error}: ${count}`);
      });
    }

    console.log(`\n💰 Final Price: $${this.currentPrice}`);
    console.log('═'.repeat(60));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private cleanup() {
    console.log('\n🧹 Cleaning up connections...');
    for (const [userId, socket] of this.sockets) {
      socket.disconnect();
    }
    this.sockets.clear();
    console.log('✅ Cleanup complete');
  }
}

// Usage
const auctionId = process.argv[2] || '6977693127b752cafc57f622';

if (testUsers.length === 0) {
  console.error('❌ No test users found. Run: npx ts-node scripts/setup-test-users.ts 500');
  process.exit(1);
}

const test = new MassiveBiddingStressTest(auctionId);
test.runAllTests().catch(console.error);