import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

const updateSettingsSchema = z.object({
  theme: z.enum(["DARK", "LIGHT"]).optional(),
  language: z.string().optional(),
  downloadFolder: z.string().optional(),
  concurrentDownloads: z.number().min(1).max(10).optional(),
  defaultFormat: z.string().optional(),
  defaultQuality: z.string().optional(),
  proxy: z.string().optional().nullable(),
  cookiesFilePath: z.string().optional().nullable(),
  bandwidthLimit: z.number().min(0).optional(),
});

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    let settings = await prisma.userSettings.findUnique({
      where: { userId: req.userId! },
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId: req.userId! },
      });
    }

    res.json({ settings });
  } catch (error) {
    console.error(`[Settings] GET error:`, error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/", async (req: AuthRequest, res: Response) => {
  try {
    const body = updateSettingsSchema.parse(req.body);
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, ...body } as any,
      update: body as any,
    });

    res.json({ settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    console.error(`[Settings] PUT error:`, error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
