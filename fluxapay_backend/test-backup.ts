import dotenv from "dotenv";
import { performDatabaseBackup } from "./src/services/dbBackup.service";

dotenv.config();

async function testBackup() {
  console.log("Starting DB Backup Test...");
  try {
    await performDatabaseBackup();
    console.log("DB Backup Test Completed successfully.");
  } catch (error) {
    console.error("DB Backup Test Failed:", error);
  }
}

testBackup();
