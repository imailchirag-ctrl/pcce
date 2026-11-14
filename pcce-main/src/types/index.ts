export type ServiceStatus = "available" | "unavailable" | "not_configured" | "configured";

export interface HealthResponse {
  status: "ok" | "degraded";
  services: {
    web: "available";
    fastapi: ServiceStatus;
    database: ServiceStatus;
  };
}
