import type { Connection } from "mongoose";
import type { AuthTokenPayload } from "../utils/jwt";
import type { TenantContext } from "../middlewares/tenant";
import type { TenantAuthUser } from "../middlewares/tenantAuth";
import type { TenantModels } from "../models/tenant";

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      /** Set by `resolveTenant` (wildcard subdomain). */
      tenant?: TenantContext;
      /** Connection of the tenant database (database name = subdomain). */
      tenantDb?: Connection;
      /** Models compiled on the tenant connection. */
      models?: TenantModels;
      /** Signed-in club admin, set by `tenantAuthenticate`. */
      tenantUser?: TenantAuthUser;
    }
  }
}

export {};
