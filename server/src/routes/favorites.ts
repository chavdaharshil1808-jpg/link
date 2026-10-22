import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

const favoriteSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  thumbnail: z.string().optional(),
  platform: z.string().optional(),
});

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
    });
    res.json({ favorites });
  } catch (error) {
    console.error(`[Favorites] GET error:`, error);
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const body = favoriteSchema.parse(req.body);
    const existing = await prisma.favorite.findUnique({
      where: { userId_url: { userId: req.userId!, url: body.url } },
    });

    if (existing) {
      res.status(409).json({ error: "Already in favorites" });
      return;
    }

    const favorite = await prisma.favorite.create({
      data: {
        userId: req.userId!,
        ...body,
      },
    });

    res.status(201).json({ favorite });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    console.error(`[Favorites] POST error:`, error);
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

router.delete("/:url", async (req: AuthRequest, res: Response) => {
  try {
    const url = decodeURIComponent(req.params.url);
    await prisma.favorite.deleteMany({
      where: { userId: req.userId!, url },
    });
    res.json({ message: "Removed from favorites" });
  } catch (error) {
    console.error(`[Favorites] DELETE error:`, error);
    res.status(500).json({ error: "Failed to remove favorite" });
  }
});

export default router;
