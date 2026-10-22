import { Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens";
import { log, sessionLog } from "./logger";

export class SessionError extends Error {
  code:
    | "SESSION_NOT_FOUND"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALID"
    | "USER_DISABLED"
    | "USER_NOT_FOUND";
  status: number;

  constructor(
    code: SessionError["code"],
    message: string,
    status = 401
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface CreateSessionOptions {
  rememberMe?: boolean;
  ip?: string;
  userAgent?: string;
  deviceLabel?: string;
}

export interface SessionPayload {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  userId: string;
  userRole: string;
}

export interface SessionInfo {
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  rememberMe: boolean;
  ip: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
}

function computeExpiry(rememberMe: boolean): Date {
  const ttlMs = rememberMe
    ? config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
    : config.SESSION_SHORT_TTL_HOURS * 60 * 60 * 1000;
  return new Date(Date.now() + ttlMs);
}

function toAccessToken(userId: string, role: string): string {
  return generateAccessToken(userId, role);
}

export async function createSession(
  userId: string,
  options: CreateSessionOptions = {}
): Promise<SessionPayload> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new SessionError("USER_NOT_FOUND", "User not found", 404);
  if (user.disabled)
    throw new SessionError("USER_DISABLED", "Account is disabled", 403);

  const rememberMe = options.rememberMe ?? true;
  const expiresAt = computeExpiry(rememberMe);
  const sessionId = uuidv4();
  const refreshToken = generateRefreshToken(user.id, sessionId, rememberMe ? config.SESSION_TTL_DAYS : Math.max(1, Math.ceil(config.SESSION_SHORT_TTL_HOURS / 24)));

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshToken,
      rememberMe,
      expiresAt,
      ip: options.ip,
      userAgent: options.userAgent,
      deviceLabel: options.deviceLabel,
    },
  });

  sessionLog("session_saved", `Session created for user ${user.id}`, {
    sessionId,
    rememberMe,
    expiresAt: expiresAt.toISOString(),
    ip: options.ip,
  });

  return {
    sessionId,
    accessToken: toAccessToken(user.id, user.role),
    refreshToken,
    expiresAt,
    userId: user.id,
    userRole: user.role,
  };
}

export async function loadSession(refreshToken: string): Promise<SessionPayload> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new SessionError("SESSION_INVALID", "Invalid refresh token");
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sessionId },
  });

  if (!session) {
    throw new SessionError("SESSION_NOT_FOUND", "Session not found");
  }
  if (session.userId !== payload.userId) {
    throw new SessionError("SESSION_REVOKED", "Session mismatch");
  }
  if (session.refreshToken !== refreshToken) {
    throw new SessionError("SESSION_REVOKED", "Session token has been rotated");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    sessionLog("session_expired", `Session ${session.id} expired`, {
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    });
    throw new SessionError("SESSION_EXPIRED", "Session has expired");
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new SessionError("USER_NOT_FOUND", "User not found", 404);
  if (user.disabled)
    throw new SessionError("USER_DISABLED", "Account is disabled", 403);

  await prisma.session.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    sessionId: session.id,
    accessToken: toAccessToken(user.id, user.role),
    refreshToken,
    expiresAt: session.expiresAt,
    userId: user.id,
    userRole: user.role,
  };
}

export async function validateSession(refreshToken: string): Promise<boolean> {
  try {
    await loadSession(refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function refreshSession(
  refreshToken: string,
  options: Pick<CreateSessionOptions, "ip" | "userAgent"> = {}
): Promise<SessionPayload> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new SessionError("SESSION_INVALID", "Invalid refresh token");
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sessionId },
  });

  if (!session) {
    throw new SessionError("SESSION_NOT_FOUND", "Session not found");
  }
  if (session.userId !== payload.userId) {
    throw new SessionError("SESSION_REVOKED", "Session mismatch");
  }
  if (session.refreshToken !== refreshToken) {
    throw new SessionError("SESSION_REVOKED", "Session token has been rotated");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    sessionLog("session_expired", `Session ${session.id} expired`, {
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    });
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    throw new SessionError("SESSION_EXPIRED", "Session has expired");
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new SessionError("USER_NOT_FOUND", "User not found", 404);
  if (user.disabled)
    throw new SessionError("USER_DISABLED", "Account is disabled", 403);

  const now = new Date();
  let expiresAt = session.expiresAt;
  const isLongLived = session.rememberMe;
  const maxExpiry = computeExpiry(isLongLived);
  const extension = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (extension.getTime() > expiresAt.getTime()) {
    expiresAt = extension.getTime() < maxExpiry.getTime() ? extension : maxExpiry;
  }

  const newRefreshToken = generateRefreshToken(
    user.id,
    session.id,
    isLongLived ? config.SESSION_TTL_DAYS : Math.max(1, Math.ceil(config.SESSION_SHORT_TTL_HOURS / 24))
  );

  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshToken: newRefreshToken,
      lastUsedAt: now,
      expiresAt,
      ip: options.ip ?? session.ip,
      userAgent: options.userAgent ?? session.userAgent,
    },
  });

  sessionLog("cookies_refreshed", `Session tokens refreshed for user ${user.id}`, {
    sessionId: session.id,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    sessionId: session.id,
    accessToken: toAccessToken(user.id, user.role),
    refreshToken: newRefreshToken,
    expiresAt,
    userId: user.id,
    userRole: user.role,
  };
}

export async function deleteSession(
  refreshTokenOrSessionId: string,
  sessionId?: string
): Promise<boolean> {
  try {
    if (sessionId) {
      await prisma.session.delete({ where: { id: sessionId } });
      sessionLog("logout", `Session ${sessionId} deleted`);
      return true;
    }
    const payload = verifyRefreshToken(refreshTokenOrSessionId);
    const result = await prisma.session.deleteMany({
      where: { id: payload.sessionId, userId: payload.userId },
    });
    if (result.count > 0) {
      sessionLog("logout", `Session ${payload.sessionId} deleted`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function deleteSessionById(userId: string, sessionId: string): Promise<boolean> {
  const result = await prisma.session.deleteMany({
    where: { id: sessionId, userId },
  });
  if (result.count > 0) {
    sessionLog("session_revoked", `Session ${sessionId} revoked by user ${userId}`);
    return true;
  }
  return false;
}

export async function deleteAllSessions(userId: string): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { userId } });
  sessionLog("logout", `All sessions deleted for user ${userId}`, {
    count: result.count,
  });
  return result.count;
}

export async function listSessions(userId: string): Promise<SessionInfo[]> {
  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      rememberMe: true,
      ip: true,
      userAgent: true,
      deviceLabel: true,
    },
  });
  return sessions;
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (result.count > 0) {
    sessionLog("session_expired", `Cleaned up ${result.count} expired sessions`);
  }
  return result.count;
}

export function safeError(error: unknown): { status: number; message: string; code?: string } {
  if (error instanceof SessionError) {
    return { status: error.status, message: error.message, code: error.code };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    log("ERROR", "SessionManager", `Prisma error: ${error.code} ${error.message}`);
  }
  return { status: 500, message: "Internal server error" };
}
