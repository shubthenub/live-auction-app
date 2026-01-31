import { Types, ClientSession } from 'mongoose';
import { Wallet } from './wallet.model.js';
import { User } from '../users/user.model.js';
import { redis } from '../config/redis.js';

export async function transferBalance(
  fromUserId: Types.ObjectId,
  toUserId: Types.ObjectId,
  amount: number,
  session: ClientSession
): Promise<void> {
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  // Get sender's wallet
  const sender = await User.findById(fromUserId)
    .select('walletId')
    .session(session)
    .lean();

  if (!sender?.walletId) {
    throw new Error('Sender wallet not found');
  }

  // Get recipient's wallet
  const recipient = await User.findById(toUserId)
    .select('walletId')
    .session(session)
    .lean();

  if (!recipient?.walletId) {
    throw new Error('Recipient wallet not found');
  }

  // Fetch wallet documents to validate
  const senderWallet = await Wallet.findById(sender.walletId).session(session);
  const recipientWallet = await Wallet.findById(recipient.walletId).session(
    session
  );

  if (!senderWallet || !recipientWallet) {
    throw new Error('Wallet documents not found');
  }

  if (senderWallet.balance < amount) {
    throw new Error(`Insufficient balance. Available: ${senderWallet.balance}, Required: ${amount}`);
  }

  // Atomic transfer
  await Wallet.findByIdAndUpdate(
    sender.walletId,
    { $inc: { balance: -amount } },
    { session, new: true }
  );

  await Wallet.findByIdAndUpdate(
    recipient.walletId,
    { $inc: { balance: amount } },
    { session, new: true }
  );

  console.log(`✅ Transferred ₹${amount} from ${fromUserId} to ${toUserId}`);
}

export async function lockBalance(
  userId: Types.ObjectId,
  amount: number
): Promise<void> {
  const walletKey = `wallet:${userId}`;
  const wallet = await redis.hgetall(walletKey);

  if (Object.keys(wallet).length === 0) {
    throw new Error('Wallet not found in Redis');
  }

  const balance = Number(wallet.balance);
  const locked = Number(wallet.locked) || 0;
  const available = balance - locked;

  if (available < amount) {
    throw new Error(
      `Insufficient available balance. Available: ${available}, Required: ${amount}`
    );
  }

  await redis.hset(walletKey, {
    balance: balance.toString(),
    locked: amount.toString(),
  });

  await redis.expire(walletKey, 3600);
  console.log(`🔒 Locked ₹${amount} for user ${userId}`);
}

export async function unlockBalance(userId: Types.ObjectId): Promise<void> {
  const walletKey = `wallet:${userId}`;

  await redis.hset(walletKey, {
    locked: '0',
  });

  console.log(`🔓 Unlocked balance for user ${userId}`);
}

export async function releaseLockedBalance(
  userId: Types.ObjectId,
  amount: number
): Promise<number> {
  const walletKey = `wallet:${userId}`;
  const wallet = await redis.hgetall(walletKey);

  if (Object.keys(wallet).length === 0) {
    throw new Error('Wallet not found in Redis');
  }

  const balance = Number(wallet.balance);
  const locked = Number(wallet.locked) || 0;
  const newBalance = balance - amount;

  if (newBalance < 0) {
    throw new Error('Invalid balance after release');
  }

  await redis.hset(walletKey, {
    balance: newBalance.toString(),
    locked: '0',
  });

  console.log(`Released ₹${amount} for user ${userId}`);
  return newBalance;
}