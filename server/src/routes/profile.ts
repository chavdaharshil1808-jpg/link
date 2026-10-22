import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional().nullable(),
});

router.put("/profile", async (req: AuthRequest, res: Response) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: body,
      select: { id: true, email: true, name: true, avatar: true, role: true },
    });
    res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.delete("/account", async (req: AuthRequest, res: Response) => {
  try {
    await prisma.download.deleteMany({ where: { userId: req.userId! } });
    await prisma.favorite.deleteMany({ where: { userId: req.userId! } });
    await prisma.userSettings.deleteMany({ where: { userId: req.userId! } });
    await prisma.user.delete({ where: { id: req.userId! } });
    res.json({ message: "Account deleted permanently" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete account" });
  }
});

router.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    const [downloadCount, favoriteCount] = await Promise.all([
      prisma.download.count({ where: { userId: req.userId! } }),
      prisma.favorite.count({ where: { userId: req.userId! } }),
    ]);
    res.json({ downloadCount, favoriteCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
