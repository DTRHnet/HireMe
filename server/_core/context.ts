import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// A synthetic dev user returned when OAuth is disabled in development mode.
const DEV_USER: User = {
  id: 1,
  openId: "dev-user-001",
  name: "Dev User",
  email: "dev@localhost",
  loginMethod: "dev",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

/**
 * Returns true when the server is running locally without an OAuth backend.
 * Set OAUTH_SERVER_URL to re-enable real authentication.
 */
function isOAuthDisabled(): boolean {
  return !ENV.isProduction && !ENV.oAuthServerUrl;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // Dev bypass: skip OAuth entirely and act as a logged-in admin.
  if (isOAuthDisabled()) {
    return {
      req: opts.req,
      res: opts.res,
      user: DEV_USER,
    };
  }

  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
