import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TestUser } from './testUsers';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to your testUsers.ts file
const TEST_USERS_PATH = path.join(__dirname, 'testUsers.ts');
const LOGIN_URL = 'http://localhost:3000/api/v1/auth/login'; // Change as needed
const PASSWORD = 'Test@123';

// Read and extract the testUsers array from the TS file
const fileContent = fs.readFileSync(TEST_USERS_PATH, 'utf-8');
const arrayMatch = fileContent.match(/export const testUsers: TestUser\[] = (\[[\s\S]*?\]);/);
if (!arrayMatch) {
  console.error('Could not find testUsers array in file.');
  process.exit(1);
}
const testUsers = JSON.parse(arrayMatch[1]);

async function loginUser(user: TestUser) {
  try {
    const res = await axios.post(LOGIN_URL, {
      email: user.email,
      password: PASSWORD
    });
    user.token = res.data.accessToken; 
    return true;
  } catch(err: any) {
    console.error(`Login failed for ${user.email}:`, err.response?.data || err.message);
    return false;
  }
}

async function main() {
  const results = await Promise.all(testUsers.map(loginUser));
  const successCount = results.filter(Boolean).length;
  console.log(`Success: ${successCount} / ${testUsers.length}`);

  // Reconstruct the file content
  const beforeArray = fileContent.split('export const testUsers: TestUser[] =')[0];
  const afterArray = fileContent.split('];').slice(1).join('];');
  const newArrayString = JSON.stringify(testUsers, null, 2);

  const newFileContent =
    beforeArray +
    'export const testUsers: TestUser[] = ' +
    newArrayString +
    ';\n' +
    afterArray;

  fs.writeFileSync(TEST_USERS_PATH, newFileContent, 'utf-8');
  console.log('Tokens updated in testUsers.ts');
}

main();