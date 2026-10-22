import { Router, Response } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  saveCookies,
  deleteCookies,
  listProviderStatus,
  isSupportedProvider,
} from "../services/providerSessions";
import { log } from "../services/logger";

const router = Router();

router.use(authenticate);

const importSchema = z.object({
  provider: z.string().min(2).max(50),
  content: z.string().min(10).max(1_000_000),
});

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const statuses = await listProviderStatus(req.userId!);
    res.json({ providers: statuses });
  } catch (error: any) {
    log("ERROR", "Cookies", "List provider status error", { error: String(error) });
    res.status(500).json({ error: "Failed to load provider sessions" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const body = importSchema.parse(req.body);
    if (!isSupportedProvider(body.provider)) {
      res.status(400).json({ error: `Unsupported provider: ${body.provider}` });
      return;
    }
    await saveCookies(req.userId!, body.provider, body.content);
    log("INFO", "Cookies", `Imported cookies for provider ${body.provider}`, {
      userId: req.userId,
    });
    res.json({ message: "Cookies imported successfully", provider: body.provider });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    const message = error?.message || "Failed to import cookies";
    res.status(400).json({ error: message });
  }
});

router.delete("/:provider", async (req: AuthRequest, res: Response) => {
  try {
    if (!isSupportedProvider(req.params.provider)) {
      res.status(400).json({ error: `Unsupported provider: ${req.params.provider}` });
      return;
    }
    await deleteCookies(req.userId!, req.params.provider);
    res.json({ message: "Provider session removed", provider: req.params.provider });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to remove provider session" });
  }
});

export default router;
