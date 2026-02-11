type AuctionSnapshot = {
  currentPrice: number;
  highestBidderId: string;
  roundEndsAt: number;
  serverTime: number;
};

const pending = new Map<string, AuctionSnapshot>();
const scheduled = new Set<string>();
const BROADCAST_DELAY = 250; // ms

export function scheduleBidBroadcast(
  io: any,
  auctionId: string,
  snapshot: AuctionSnapshot
) {
  if (!auctionId || !io) {
    console.error('[WS] Invalid parameters for broadcast', { auctionId });
    return;
  }
  if (!snapshot.currentPrice || snapshot.currentPrice <= 0) return;

  const existing = pending.get(auctionId);
  // High-water mark: only update if the new bid is higher than what's already queued
  if (existing && snapshot.currentPrice <= existing.currentPrice) return;
  pending.set(auctionId, snapshot);

  if (scheduled.has(auctionId)) {
    console.log('[WS] Coalescing bid update', auctionId);
    return;
  }

  scheduled.add(auctionId);
  console.log('[WS] Scheduling broadcast', auctionId);

  setTimeout(() => {
    try {
      const latest = pending.get(auctionId);
      if (latest) {
        io.to(`auction:${auctionId}`).emit('bidUpdate', latest);
        console.log('[WS] Emitted bidUpdate', { auctionId, price: latest.currentPrice });
      }
    } catch (error) {
      console.error('[WS] Broadcast failed', { auctionId, error });
    } finally {
      pending.delete(auctionId);
      scheduled.delete(auctionId);
    }
  }, BROADCAST_DELAY);
}