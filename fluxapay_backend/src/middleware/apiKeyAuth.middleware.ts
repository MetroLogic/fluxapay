import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express";
import { PrismaClient } from "../generated/client/client";
import { compareKeys } from "../helpers/crypto.helper";
import jwt, { JwtPayload } from "jsonwebtoken";

const prisma = new PrismaClient();

/**
 * Middleware to authenticate requests using an API key or JWT.
 * Supports:
 * - Authorization: Bearer <sk_live_...>   (production API key)
 * - Authorization: Bearer <fpk_test_...>  (local dev / seed API key)
 * - x-api-key: <sk_live_...> or <fpk_test_...>
 * - Authorization: Bearer <jwt_token>     (dashboard / internal)
 */
export async function authenticateApiKey(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) {
    const authReq = req as any; // Cast to avoid lint errors when types are unstable
    const authHeader = req.headers["authorization"];
    const xApiKey = req.headers["x-api-key"];

    let key: string | undefined;

    // 1. Check for x-api-key header
    if (xApiKey && typeof xApiKey === "string") {
        key = xApiKey;
    }
    // 2. Check for Authorization header
    else if (authHeader?.toLowerCase()?.startsWith("bearer ")) {
        key = authHeader.split(" ")[1];
    }

    if (!key) {
        return res.status(401).json({ message: "Authentication required" });
    }

    // 3. Try interpreting as API Key first.
    //    FluxaPay keys use the format <prefix>_<32 hex chars>.
    //    Supported prefixes: sk_live_ (production), fpk_test_ (local dev/seed).
    //    The real validation is the bcrypt hash comparison — the prefix is only
    //    used to distinguish API keys from JWT tokens.
    const isApiKey = key.startsWith("sk_live_") || key.startsWith("fpk_test_");
    if (isApiKey) {
        try {
            const lastFour = key.slice(-4);

            // Find merchants with matching last four to narrow down search
            const merchants = await prisma.merchant.findMany({
                where: { api_key_last_four: lastFour, status: "active" },
                select: { id: true, api_key_hashed: true }
            });

            for (const merchant of merchants) {
                if (merchant.api_key_hashed && await compareKeys(key, merchant.api_key_hashed)) {
                    authReq.merchantId = merchant.id;
                    return next();
                }
            }

            return res.status(401).json({ message: "Invalid API key" });
        } catch (error) {
            console.error("API Key Auth Error:", error);
            return res.status(500).json({ message: "Authentication error" });
        }
    }

    // 4. Try interpreting as JWT (for dashboard/internal use)
    try {
        const payload = jwt.verify(key, process.env.JWT_SECRET!) as JwtPayload;
        if (payload && payload.id) {
            authReq.merchantId = payload.id;
            authReq.user = { id: payload.id, email: payload.email };
            return next();
        }
    } catch (err) {
        // If it's not a valid JWT either, then fail
        return res.status(401).json({ message: "Invalid authentication credentials" });
    }

    return res.status(401).json({ message: "Authentication failed" });
}
