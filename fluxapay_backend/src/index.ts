import { app } from "./app";
import dotenv from "dotenv";
import { startCronJobs } from "./services/cron.service";

dotenv.config();

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);

  // Start scheduled jobs (daily settlement batch, etc.)
  startCronJobs();
});

