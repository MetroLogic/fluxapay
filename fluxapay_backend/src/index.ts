import dotenv from "dotenv";
import { validateEnv, EnvValidationError } from "./config/env.config";
import { startCronJobs } from "./services/cron.service";
import { startPaymentMonitor } from "./services/paymentMonitor.service";

dotenv.config();

// Validate environment variables on startup (fail fast)
let config;
try {
  config = validateEnv();
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
  } else {
    console.error('Failed to validate environment:', error);
  }
  process.exit(1);
}

import { app } from "./app";

app.listen(config.PORT, () => {
  console.log(`✅ Server is running on port ${config.PORT}`);
  console.log(`📚 Swagger docs available at http://localhost:${config.PORT}/api-docs`);

  // Start scheduled jobs (daily settlement batch, etc.)
  startCronJobs();

  // Start payment monitor loop
  startPaymentMonitor();
});
