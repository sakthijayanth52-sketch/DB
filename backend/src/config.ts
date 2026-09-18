export const config = {
  port: Number(process.env.PORT ?? 8080),
  corsOrigin: process.env.DB_CORS_ORIGIN ?? "*",
  modelProvider: process.env.MODEL_PROVIDER ?? "mock"
} as const;
