import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { testUsers } from './testUsers.js';

const PROFILE_URL = 'http://localhost:3000/api/v1/auth/me'; // Adjust if different

async function fetchUserId(user: any) {
  try {
    const res = await axios.get(PROFILE_URL, {
      headers: { Authorization: `Bearer ${user.token}` }
    });
    user.id = res.data.id || res.data._id || res.data.user?.id;
    return true;
  } catch (err: any) {
    console.error(`Failed for ${user.email}:`, err.response?.data || err.message);
    return false;
  }
}

async function main() {
  const results = await Promise.all(testUsers.map(fetchUserId));
  const successCount = results.filter(Boolean).length;
  console.log(`Updated ${successCount} users`);

  // Write back to testUsers.ts
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const TEST_USERS_PATH = path.join(__dirname, 'testUsers.ts');

  const fileHeader = `// Auto-generated test users - DO NOT EDIT MANUALLY
export interface TestUser {
  id: string;
  email: string;
  username: string;
  token: string;
}
//pass for all = Test@123
export const testUsers: TestUser[] = `;
  const arrayString = JSON.stringify(testUsers, null, 2);
  const fileContent = `${fileHeader}${arrayString};\n`;

  fs.writeFileSync(TEST_USERS_PATH, fileContent, 'utf-8');
  console.log('testUsers.ts updated with user IDs');
}

main();