type AuctionSnapshot = {
  currentPrice: number;
  highestBidderId: string;
  roundEndsAt: number;
  serverTime: number;
};

const pending = new Map<string, AuctionSnapshot>();
const scheduled = new Set<string>();

export function scheduleBidBroadcast(
  io: any,
  auctionId: string,
  snapshot: AuctionSnapshot
) {
  pending.set(auctionId, snapshot);

  if (scheduled.has(auctionId)) {
    console.log('[WS] Coalescing bid update', auctionId);
    return;
  }

  scheduled.add(auctionId);

  console.log('[WS] Scheduling broadcast', auctionId);

  setTimeout(() => {
    const latest = pending.get(auctionId);
    if (latest) {
      console.log('[WS] Emitting bidUpdate', {
        auctionId,
        price: latest.currentPrice,
        bidder: latest.highestBidderId,
      });

      io.to(`auction:${auctionId}`).emit('bidUpdate', latest);
    }

    pending.delete(auctionId);
    scheduled.delete(auctionId);
  }, 250);
}

