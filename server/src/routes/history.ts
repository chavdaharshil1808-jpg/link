import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

router.delete("/all", async (req: AuthRequest, res: Response) => {
  try {
    await prisma.download.deleteMany({ where: { userId: req.userId! } });
    res.json({ message: "All download history cleared" });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear history" });
  }
});

export default router;
