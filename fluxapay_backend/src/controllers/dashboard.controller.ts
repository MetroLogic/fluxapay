import { createController } from "../helpers/controller.helper";

import * as dashboardService from "../services/dashboard.service";

export const overviewMetrics = createController(
  dashboardService.getDashboardOverview,
  201,
);

export const analytics = createController(
  dashboardService.getDashboardAnalytics,
  201,
);

export const activity = createController(
  dashboardService.getDashboardActivity,
  201,
);
