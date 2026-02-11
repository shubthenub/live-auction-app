import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REGISTER_URL = "http://localhost:3000/api/v1/auth/register";
const PASSWORD = "Test@123";
const TOTAL_USERS = 500;

// Path to your testUsers.ts file
const TEST_USERS_PATH = path.join(__dirname, "testUsers.ts");

interface TestUser {
  id: string;
  email: string;
  username: string;
  token: string;
}

async function registerUser(index: number): Promise<TestUser | null> {
  const email = `testuser${index}@test.com`;
  const username = `testuser${index}`;
  try {
    const res = await axios.post(REGISTER_URL, {
      email,
      username,
      password: PASSWORD,
      role: "USER", 
    });

    const { id, accessToken } = res.data;
    return {
      id: id || res.data.user?.id,
      email,
      username,
      token: accessToken || res.data.token,
    };
  } catch (err: any) {
    console.error(
      `Failed to register ${email}:`,
      err.response?.data || err.message,
    );
    return null;
  }
}

async function main() {
  const users: TestUser[] = [];
  const promises = [];
  for (let i = 0; i < TOTAL_USERS; i++) {
    promises.push(registerUser(i));
  }
  const results = await Promise.all(promises);
  for (const user of results) {
    if (user) users.push(user);
  }
  console.log(`Created ${users.length} users out of ${TOTAL_USERS}`);

  // Prepare TypeScript file content
  const fileHeader = `// Auto-generated test users - DO NOT EDIT MANUALLY
export interface TestUser {
  id: string;
  email: string;
  username: string;
  token: string;
}
//pass for all = Test@123
export const testUsers: TestUser[] = `;
  const arrayString = JSON.stringify(users, null, 2);
  const fileContent = `${fileHeader}${arrayString};\n`;

  // Write to testUsers.ts
  fs.writeFileSync(TEST_USERS_PATH, fileContent, "utf-8");
  console.log("testUsers.ts updated with new users");
}

main();
