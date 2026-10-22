import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { log } from "../services/logger";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const path = req.path;
  const method = req.method;

  // Support token via Authorization header (axios/fetch) or ?token= query param (anchor tag downloads)
  let token: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query.token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (!token) {
    log("WARN", "AuthMiddleware", `401 No auth token | ${method} ${path}`);
    res.status(401).json({ error: "Access denied. No authorization token." });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string; role: string };
    req.userId = decoded.userId;
    req.userRole = decoded.role;

    prisma.user.findUnique({ where: { id: decoded.userId } }).then(user => {
      if (user?.disabled) {
        log("WARN", "AuthMiddleware", `403 User disabled | userId=${decoded.userId} | ${method} ${path}`);
        res.status(403).json({ error: "Your account has been disabled. Contact support." });
        return;
      }
      log("INFO", "AuthMiddleware", `Auth OK | userId=${decoded.userId} role=${decoded.role} | ${method} ${path}`);
      next();
    }).catch(() => {
      log("INFO", "AuthMiddleware", `Auth OK (db check failed) | userId=${decoded.userId} role=${decoded.role} | ${method} ${path}`);
      next();
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      log("WARN", "AuthMiddleware", `401 Token expired | ${method} ${path}`);
      res.status(401).json({ error: "Token expired. Please refresh or login again." });
    } else if (error instanceof jwt.JsonWebTokenError) {
      log("WARN", "AuthMiddleware", `401 Invalid JWT | ${method} ${path} | ${error.message}`);
      res.status(401).json({ error: "Invalid token. Please login again." });
    } else {
      log("ERROR", "AuthMiddleware", `401 JWT verify error | ${method} ${path} | ${String(error)}`);
      res.status(401).json({ error: "Token verification failed." });
    }
  }
}

export function adminAuthenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const path = req.path;
  const method = req.method;

  if (!authHeader) {
    log("WARN", "AuthMiddleware", `401 No auth header | ${method} ${path}`);
    res.status(401).json({ error: "Access denied. No authorization header." });
    return;
  }

  if (!authHeader.startsWith("Bearer ")) {
    log("WARN", "AuthMiddleware", `401 Invalid auth format | ${method} ${path}`);
    res.status(401).json({ error: "Access denied. Invalid authorization format. Use: Bearer <token>" });
    return;
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    log("WARN", "AuthMiddleware", `401 Empty token | ${method} ${path}`);
    res.status(401).json({ error: "Access denied. Token is empty." });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.ADMIN_JWT_SECRET) as { userId: string; role: string };
    if (decoded.role !== "ADMIN") {
      log("WARN", "AuthMiddleware", `403 Not admin | ${method} ${path}`);
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    log("INFO", "AuthMiddleware", `Admin auth OK | userId=${decoded.userId} | ${method} ${path}`);
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      log("WARN", "AuthMiddleware", `401 Admin token expired | ${method} ${path}`);
      res.status(401).json({ error: "Admin session expired. Please login again." });
    } else if (error instanceof jwt.JsonWebTokenError) {
      log("WARN", "AuthMiddleware", `401 Invalid admin JWT | ${method} ${path} | ${error.message}`);
      res.status(401).json({ error: "Invalid admin token. Please login again." });
    } else {
      log("ERROR", "AuthMiddleware", `401 Admin JWT verify error | ${method} ${path} | ${String(error)}`);
      res.status(401).json({ error: "Admin token verification failed." });
    }
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      log("WARN", "AuthMiddleware", `403 Forbidden | userRole=${req.userRole} required=${roles.join(",")}`);
      res.status(403).json({ error: "Insufficient permissions." });
      return;
    }
    next();
  };
}
