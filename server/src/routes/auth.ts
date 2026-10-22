import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "../lib/prisma";
import { generateMagicToken } from "../utils/tokens";
import { sendMagicLinkEmail } from "../services/email";
import { config } from "../config";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  createSession,
  refreshSession,
  deleteSession,
  deleteAllSessions,
  deleteSessionById,
  listSessions,
  SessionError,
  safeError,
} from "../services/sessionManager";
import { log } from "../services/logger";

const router = Router();

const googleCallbackURL = `${config.SERVER_URL}/api/auth/google/callback`;

log("INFO", "Auth", "Google OAuth strategy setup", {
  serverUrl: config.SERVER_URL,
  callbackURL: googleCallbackURL,
  googleConfigured: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
});

if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: googleCallbackURL,
        scope: ["openid", "profile", "email"],
        proxy: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(null, false, { message: "No email in Google profile" });

          const providerId = profile.id || (profile._json as any)?.sub;
          if (!providerId) return done(null, false, { message: "No provider ID in Google profile" });

          let user = await prisma.user.findFirst({
            where: { provider: "google", providerId },
          });

          if (!user) {
            user = await prisma.user.findUnique({ where: { email } });
            if (user) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: { provider: "google", providerId, avatar: profile.photos?.[0]?.value },
              });
            } else {
              user = await prisma.user.create({
                data: {
                  email,
                  name: profile.displayName,
                  avatar: profile.photos?.[0]?.value,
                  provider: "google",
                  providerId,
                  emailVerified: true,
                  settings: { create: {} },
                },
              });
            }
          }

          return done(null, user as any);
        } catch (err) {
          return done(err as any);
        }
      }
    )
  );
} else {
  log("WARN", "Auth", "Google OAuth skipped - GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET empty");
}

router.use(passport.initialize());

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  rememberMe: z.boolean().optional(),
});

const magicLinkSchema = z.object({
  email: z.string().email(),
});

function sessionContext(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.headers["user-agent"] || undefined,
  };
}

function setRefreshCookie(res: Response, refreshToken: string, rememberMe: boolean) {
  const maxAge = rememberMe
    ? config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
    : config.SESSION_SHORT_TTL_HOURS * 60 * 60 * 1000;
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  });
}

function publicUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
  };
}

router.post("/signup", async (req: Request, res: Response) => {
  try {
    const body = signupSchema.parse(req.body);
    log("INFO", "Auth", "Signup attempt", { email: body.email });

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        settings: { create: {} },
      },
    });

    const session = await createSession(user.id, {
      rememberMe: true,
      ...sessionContext(req),
    });

    setRefreshCookie(res, session.refreshToken, true);

    log("INFO", "Auth", "Signup successful", { userId: user.id, sessionId: session.sessionId });
    res.status(201).json({
      user: publicUser(user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    log("ERROR", "Auth", "Signup error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    log("INFO", "Auth", "Login attempt", { email: body.email });

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.passwordHash) {
      log("WARN", "Auth", "Login failed - user not found or no password", { email: body.email });
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      log("WARN", "Auth", "Login failed - wrong password", { email: body.email });
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const rememberMe = body.rememberMe ?? false;
    const session = await createSession(user.id, {
      rememberMe,
      ...sessionContext(req),
    });

    setRefreshCookie(res, session.refreshToken, rememberMe);

    log("INFO", "Auth", "Login successful", {
      userId: user.id,
      sessionId: session.sessionId,
      rememberMe,
    });
    res.json({
      user: publicUser(user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    log("ERROR", "Auth", "Login error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/magic-link", async (req: Request, res: Response) => {
  try {
    const body = magicLinkSchema.parse(req.body);
    log("INFO", "Auth", "Magic link request", { email: body.email });

    const magicToken = generateMagicToken();
    const magicExpiry = new Date(Date.now() + 15 * 60 * 1000);

    let user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: body.email,
          magicToken,
          magicExpiry,
          emailVerified: true,
          settings: { create: {} },
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { magicToken, magicExpiry },
      });
    }

    const magicLink = `${config.CLIENT_URL}/auth/verify-magic?token=${magicToken}`;
    await sendMagicLinkEmail(body.email, magicLink);

    log("INFO", "Auth", "Magic link sent", { email: body.email });
    res.json({ message: "Magic link sent to your email" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    log("ERROR", "Auth", "Magic link error", { error: String(error) });
    res.status(500).json({ error: "Failed to send magic link. Email service may not be configured." });
  }
});

router.post("/verify-magic", async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: "Token is required" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { magicToken: token, magicExpiry: { gt: new Date() } },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid or expired magic link" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { magicToken: null, magicExpiry: null, emailVerified: true },
    });

    const session = await createSession(user.id, {
      rememberMe: true,
      ...sessionContext(req),
    });

    setRefreshCookie(res, session.refreshToken, true);

    log("INFO", "Auth", "Magic link verified", {
      userId: user.id,
      sessionId: session.sessionId,
    });
    res.json({
      user: publicUser(user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  } catch (error) {
    log("ERROR", "Auth", "Verify magic error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!refreshToken) {
    log("WARN", "Auth", "Refresh failed - no token provided");
    res.status(401).json({ error: "No refresh token provided. Please login again." });
    return;
  }

  try {
    const session = await refreshSession(refreshToken, sessionContext(req));
    setRefreshCookie(res, session.refreshToken, true);
    log("INFO", "Auth", "Token refreshed", {
      userId: session.userId,
      sessionId: session.sessionId,
    });
    res.json({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  } catch (error) {
    const safe = safeError(error);
    log("WARN", "Auth", "Refresh failed", { error: safe.message, code: safe.code });
    res.status(safe.status).json({ error: safe.message });
  }
});

router.post("/logout", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    let deleted = false;
    if (refreshToken) {
      deleted = await deleteSession(refreshToken);
    }
    if (!deleted && req.userId) {
      deleted = (await deleteAllSessions(req.userId)) > 0;
    }
    res.clearCookie("refreshToken", { path: "/" });
    log("INFO", "Auth", "User logged out", { userId: req.userId, sessionDeleted: deleted });
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    log("ERROR", "Auth", "Logout error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout-all", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await deleteAllSessions(req.userId!);
    res.clearCookie("refreshToken", { path: "/" });
    log("INFO", "Auth", "All sessions logged out", { userId: req.userId });
    res.json({ message: "Logged out from all devices" });
  } catch (error) {
    log("ERROR", "Auth", "Logout-all error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sessions", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await listSessions(req.userId!);
    res.json({ sessions });
  } catch (error) {
    log("ERROR", "Auth", "List sessions error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/sessions/:sessionId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await deleteSessionById(req.userId!, req.params.sessionId);
    if (!deleted) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ message: "Session revoked" });
  } catch (error) {
    log("ERROR", "Auth", "Revoke session error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        provider: true,
        emailVerified: true,
        createdAt: true,
        settings: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    log("ERROR", "Auth", "Get profile error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/google", (req: Request, res: Response, next: NextFunction) => {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    res.redirect(`${config.CLIENT_URL}/login?error=${encodeURIComponent("Google OAuth is not configured")}`);
    return;
  }
  passport.authenticate("google", { scope: ["openid", "profile", "email"], session: false })(req, res, next);
});

router.get("/google/callback", (req: Request, res: Response, next: NextFunction) => {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    res.redirect(`${config.CLIENT_URL}/login?error=${encodeURIComponent("Google OAuth is not configured")}`);
    return;
  }
  passport.authenticate("google", { session: false }, async (err: any, user: any, info: any) => {
    if (err) {
      log("ERROR", "Auth", "Google auth error", { error: err.message });
      const msg = encodeURIComponent(err.message || "google_auth_error");
      return res.redirect(`${config.CLIENT_URL}/login?error=${msg}`);
    }
    if (!user) {
      const reason = info?.message ? encodeURIComponent(info.message) : "google_failed";
      log("WARN", "Auth", "Google auth failed", { reason: info?.message });
      return res.redirect(`${config.CLIENT_URL}/login?error=${reason}`);
    }

    try {
      const session = await createSession(user.id, {
        rememberMe: true,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || undefined,
      });
      setRefreshCookie(res, session.refreshToken, true);

      log("INFO", "Auth", "Google login successful", {
        userId: user.id,
        sessionId: session.sessionId,
      });
      res.redirect(
        `${config.CLIENT_URL}/auth/callback?token=${session.accessToken}&refreshToken=${session.refreshToken}`
      );
    } catch (error) {
      const safe = safeError(error);
      log("ERROR", "Auth", "Google callback error", { error: safe.message });
      res.redirect(`${config.CLIENT_URL}/login?error=google_callback_error`);
    }
  })(req, res, next);
});

export default router;
