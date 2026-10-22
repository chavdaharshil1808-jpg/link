import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { adminAuthenticate, AuthRequest } from "../middleware/auth";
import { config } from "../config";

const prisma = new PrismaClient();
const router = Router();

function log(level: string, msg: string, data?: any) {
  const entry = `[Admin] ${level}: ${msg}${data ? " | " + JSON.stringify(data).slice(0, 500) : ""}`;
  console.log(entry);
}

// Admin login - validates against env vars, issues admin JWT signed with ADMIN_JWT_SECRET
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    if (email !== config.ADMIN_EMAIL) {
      log("WARN", "Admin login failed - wrong email");
      res.status(401).json({ error: "Invalid admin credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, config.ADMIN_PASSWORD_HASH);
    if (!valid) {
      log("WARN", "Admin login failed - wrong password");
      res.status(401).json({ error: "Invalid admin credentials" });
      return;
    }
    const accessToken = jwt.sign(
      { userId: "admin", role: "ADMIN" },
      config.ADMIN_JWT_SECRET,
      { expiresIn: "2h" }
    );
    log("INFO", "Admin login successful");
    res.json({ accessToken, user: { email: config.ADMIN_EMAIL, role: "ADMIN" } });
  } catch (error) {
    log("ERROR", "Admin login error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.use(adminAuthenticate);

router.get("/dashboard", async (_req: AuthRequest, res: Response) => {
  try {
    const [totalUsers, totalDownloads, downloadsToday, downloadsWeek, platforms] = await Promise.all([
      prisma.user.count(),
      prisma.download.count(),
      prisma.download.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      prisma.download.count({ where: { createdAt: { gte: new Date(Date.now() - 604800000) } } }),
      prisma.download.groupBy({ by: ["platform"], _count: true, orderBy: { _count: { platform: "desc" } } }),
    ]);

    const activeUsers = await prisma.user.count({ where: { refreshToken: { not: null } } });
    const topPlatform = platforms[0]?.platform || "N/A";

    res.json({
      totalUsers,
      activeUsers,
      totalDownloads,
      downloadsToday,
      downloadsWeek,
      topPlatform,
      platforms: platforms.map(p => ({ platform: p.platform, count: p._count })),
    });
  } catch (error) {
    log("ERROR", "Dashboard stats error", { error: String(error) });
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

router.get("/users", async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const where = search ? {
      OR: [
        { email: { contains: search } },
        { name: { contains: search } },
      ],
    } : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, email: true, name: true, role: true, provider: true,
          emailVerified: true, createdAt: true, updatedAt: true,
          _count: { select: { downloads: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map(u => ({
        ...u,
        downloadCount: u._count.downloads,
        _count: undefined,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    log("ERROR", "Fetch users error", { error: String(error) });
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.put("/users/:userId/toggle-status", async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { disabled: !user.disabled },
    });
    log("INFO", `User ${updated.disabled ? "disabled" : "enabled"}`, { userId: req.params.userId });
    res.json({ message: `User ${updated.disabled ? "disabled" : "enabled"}`, disabled: updated.disabled });
  } catch (error) {
    log("ERROR", "Toggle user status error", { error: String(error) });
    res.status(500).json({ error: "Failed to toggle user status" });
  }
});

router.delete("/users/:userId", async (req: AuthRequest, res: Response) => {
  try {
    await prisma.download.deleteMany({ where: { userId: req.params.userId } });
    await prisma.favorite.deleteMany({ where: { userId: req.params.userId } });
    await prisma.userSettings.deleteMany({ where: { userId: req.params.userId } });
    await prisma.user.delete({ where: { id: req.params.userId } });
    log("INFO", "User deleted", { userId: req.params.userId });
    res.json({ message: "User deleted permanently" });
  } catch (error) {
    log("ERROR", "Delete user error", { error: String(error) });
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/downloads", async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const skip = (page - 1) * limit;

    const [downloads, total] = await Promise.all([
      prisma.download.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      prisma.download.count(),
    ]);

    res.json({
      downloads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    log("ERROR", "Fetch downloads error", { error: String(error) });
    res.status(500).json({ error: "Failed to fetch downloads" });
  }
});

router.get("/analytics", async (_req: AuthRequest, res: Response) => {
  try {
    const now = Date.now();
    const dayMs = 86400000;
    const dailyLabels: string[] = [];
    const dailyData: number[] = [];

    for (let i = 6; i >= 0; i--) {
      const start = new Date(now - (i + 1) * dayMs);
      const end = new Date(now - i * dayMs);
      const count = await prisma.download.count({ where: { createdAt: { gte: start, lt: end } } });
      const d = new Date(start);
      dailyLabels.push(d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
      dailyData.push(count);
    }

    const weeklyLabels: string[] = [];
    const weeklyData: number[] = [];
    for (let i = 3; i >= 0; i--) {
      const start = new Date(now - (i + 1) * 7 * dayMs);
      const end = new Date(now - i * 7 * dayMs);
      const count = await prisma.download.count({ where: { createdAt: { gte: start, lt: end } } });
      weeklyLabels.push(`Week ${4 - i}`);
      weeklyData.push(count);
    }

    const monthlyLabels: string[] = [];
    const monthlyData: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now - i * 30 * dayMs);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const count = await prisma.download.count({ where: { createdAt: { gte: start, lt: end } } });
      monthlyLabels.push(start.toLocaleDateString("en-US", { month: "short", year: "numeric" }));
      monthlyData.push(count);
    }

    res.json({
      daily: { labels: dailyLabels, data: dailyData },
      weekly: { labels: weeklyLabels, data: weeklyData },
      monthly: { labels: monthlyLabels, data: monthlyData },
    });
  } catch (error) {
    log("ERROR", "Analytics fetch error", { error: String(error) });
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

export default router;
