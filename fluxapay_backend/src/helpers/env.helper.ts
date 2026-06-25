import { getEnvConfig } from '../config/env.config';

export const isDevEnv = () => process.env.NODE_ENV === "development";

/**
 * Get the validated environment configuration
 * Safe to use throughout the application after startup
 */
export const getConfig = () => getEnvConfig();
