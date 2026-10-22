import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const isProduction = config.NODE_ENV === "production";
  console.error(`[ERROR] ${req.method} ${req.path}: ${err.message}`);
  if (!isProduction) {
    console.error(err.stack);
  }
  res.status(500).json({
    error: isProduction ? "Internal server error" : err.message,
    ...(isProduction ? {} : { stack: err.stack?.split("\n").map(s => s.trim()).slice(0, 5) }),
  });
}
