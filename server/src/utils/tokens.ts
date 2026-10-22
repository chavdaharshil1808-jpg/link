import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";

interface TokenPayload {
  userId: string;
  role: string;
}

export function generateAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role } as TokenPayload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as any,
  });
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  type: "refresh";
}

export function generateRefreshToken(
  userId: string,
  sessionId: string,
  ttlDays?: number
): string {
  const ttl = ttlDays ?? config.SESSION_TTL_DAYS;
  return jwt.sign(
    { userId, sessionId, type: "refresh" } as RefreshTokenPayload,
    config.JWT_REFRESH_SECRET,
    { expiresIn: `${ttl}d` }
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  if (payload.type !== "refresh" || !payload.sessionId) {
    throw new jwt.JsonWebTokenError("Invalid refresh token");
  }
  return payload;
}

export function generateMagicToken(): string {
  return uuidv4();
}

export function generateApiKey(): string {
  return `ud_${uuidv4().replace(/-/g, "")}`;
}
