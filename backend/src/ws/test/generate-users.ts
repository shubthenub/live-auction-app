import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Models
import { User } from '../../users/user.model.js';
import { Wallet } from '../../wallet/wallet.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOCK_FILE_PATH = path.join(__dirname, 'mock-users.csv');

const TOTAL_USERS = 5000;
const BATCH_SIZE = 250;
const WALLET_BALANCE = 1000000;

async function generateUsers() {
  if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
    throw new Error('Missing MONGO_URI or JWT_SECRET in environment');
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect('mongodb://localhost:27018/live-auction');
  console.log('✅ Connected.');

  console.log(`🗑️ Clearing old test users...`);
  await User.deleteMany({ email: { $regex: /@stress\.test$/ } });

  const mockUsers: any[] = [];
  
  // ==========================================
  // 1. GENERATE THE MOCK AUCTIONEER
  // ==========================================
  console.log('👨‍⚖️ Generating 1 Mock Auctioneer...');
  
  const auctioneerWalletId = new mongoose.Types.ObjectId();
  const auctioneerUserId = new mongoose.Types.ObjectId();

    await Wallet.create({
    _id: auctioneerWalletId,
    balance: WALLET_BALANCE,
    locked: 0,
    userId: auctioneerUserId,
  });

  await User.create({
    _id: auctioneerUserId,
    username: `mock_auctioneer`,
    email: `auctioneer@stress.test`,
    passwordHash: 'hashed_password_placeholder', // Schema uses passwordHash
    role: 'AUCTIONEER',
    walletId: auctioneerWalletId,
  });

  const auctioneerToken = jwt.sign(
    { sub: auctioneerUserId.toString(), role: 'AUCTIONEER' },
    process.env.JWT_SECRET as string,
    { expiresIn: '3650d' }
  );

  mockUsers.push({
    type: 'AUCTIONEER_DO_NOT_USE_IN_LOAD_TEST', // Flag so you know which one it is
    id: auctioneerUserId.toString(),
    token: auctioneerToken,
    email: 'auctioneer@stress.test'
  });

  // ==========================================
  // 2. GENERATE THE 5000 MOCK BIDDERS
  // ==========================================
  let generatedCount = 0;
  console.log(`🚀 Generating ${TOTAL_USERS} normal users in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < TOTAL_USERS; i += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, TOTAL_USERS - i);
    const walletsToInsert = [];
    const usersToInsert = [];

    // Prepare Wallets
    for (let j = 0; j < batchSize; j++) {
      walletsToInsert.push({
        balance: WALLET_BALANCE,
        locked: 0,
        userId: new mongoose.Types.ObjectId(),
      });
    }


    const insertedWallets = await Wallet.insertMany(walletsToInsert);

    // Prepare Users mapping to the inserted Wallets
    for (let j = 0; j < batchSize; j++) {
      const userIndex = i + j;
      const walletId = insertedWallets[j]._id;
      const userId = new mongoose.Types.ObjectId();
      
      usersToInsert.push({
        _id: userId,
        username: `stress_user_${userIndex}`,
        email: `stress_user_${userIndex}@stress.test`,
        passwordHash: 'hashed_password_placeholder',
        role: 'USER',
        walletId: walletId,
      });

      const token = jwt.sign(
        { sub: userId.toString(), role: 'USER' },
        process.env.JWT_SECRET as string,
        { expiresIn: '3650d' }
      );

      mockUsers.push({
        id: userId.toString(),
        token: token,
      });
    }

    await User.insertMany(usersToInsert);

    generatedCount += batchSize;
    console.log(`  ⏳ Progress: ${generatedCount} / ${TOTAL_USERS} users created.`);
    
    // Pause briefly so we don't instantly crash local Mongo
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

    console.log(`💾 Writing tokens to ${MOCK_FILE_PATH}...`);
    // Map the objects into a clean comma-separated string format
    const csvData = mockUsers.map(u => `${u.id},${u.token}`).join('\n');
    fs.writeFileSync(MOCK_FILE_PATH, csvData);


  console.log('\n======================================================');
  console.log('🎉 Done! Setup complete.');
  console.log('👉 HERE IS YOUR AUCTIONEER TOKEN TO CREATE AUCTIONS WITH:');
  console.log(auctioneerToken);
  console.log('======================================================\n');
  
  await mongoose.disconnect();
}

generateUsers().catch(console.error);
