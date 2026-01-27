// export interface TestUser {
//   id: string;
//   email: string;
//   username: string;
//   token: string;
// }

// export const testUsers: TestUser[] = [
//   // Will be populated by the setup script
// ];

// export function getTestUser(index: number): TestUser | undefined {
//   return testUsers[index];
// }

// export function getAllTestUsers(): TestUser[] {
//   return testUsers;
// }

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { User } from '../users/user.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupTestUsers(count: number = 500) {
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log('📦 Connected to MongoDB');

    // Clean up existing test users
    await User.deleteMany({ email: /^testuser\d+@test\.com$/ });
    console.log('🧹 Cleaned up existing test users');

    const users = [];
    const hashedPassword = await bcrypt.hash('Test@123', 10);

    console.log(`🔄 Creating ${count} test users...`);

    for (let i = 0; i < count; i++) {
      const user = await User.create({
        username: `testuser${i}`,
        email: `testuser${i}@test.com`,
        passwordHash: hashedPassword,
        role: 'USER',
      });

      const token = jwt.sign(
        {
          sub: user._id.toString(),
          role: user.role,
          aud: env.JWT_AUDIENCE,
          iss: env.JWT_ISSUER,
        },
        env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      users.push({
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        token,
      });

      if ((i + 1) % 50 === 0) {
        console.log(`✅ Created ${i + 1}/${count} users`);
      }
    }

    // Write to testUsers.ts
    const fileContent = `// Auto-generated test users - DO NOT EDIT MANUALLY
export interface TestUser {
  id: string;
  email: string;
  username: string;
  token: string;
}

export const testUsers: TestUser[] = ${JSON.stringify(users, null, 2)};

export function getTestUser(index: number): TestUser | undefined {
  return testUsers[index];
}

export function getAllTestUsers(): TestUser[] {
  return testUsers;
}

export function getRandomTestUser(): TestUser {
  return testUsers[Math.floor(Math.random() * testUsers.length)];
}
`;

    const targetPath = path.join(__dirname, '../ws/test/testUsers.ts');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, fileContent);

    console.log(`\n✅ Successfully created ${count} test users`);
    console.log(`📄 Saved to: ${targetPath}`);
    console.log(`\nSample user:`);
    console.log(`  Email: ${users[0].email}`);
    console.log(`  ID: ${users[0].id}`);
    console.log(`  Token: ${users[0].token.substring(0, 50)}...`);

    await mongoose.disconnect();
    console.log('\n📦 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error setting up test users:', error);
    process.exit(1);
  }
}

// Run with: npx ts-node src/scripts/setup-test-users.ts
const userCount = parseInt(process.argv[2] || '500');
setupTestUsers(userCount);