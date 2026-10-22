import { Router, Request, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  checkInstagramAuth,
  triggerBrowserAuth,
  pollAuthCookies,
  analyzeInstagramUrl,
} from "../services/instagramService";
import { getCookies, deleteCookies } from "../services/providerSessions";

const router = Router();

router.use(authenticate);

router.get("/auth/status", async (req: AuthRequest, res: Response) => {
  try {
    const status = await checkInstagramAuth(req.userId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({
      authenticated: false,
      hasCookieFile: false,
      browsersAvailable: [],
      message: "Failed to check authentication status",
    });
  }
});

router.post("/auth/browser", async (_req: Request, res: Response) => {
  try {
    const result = await triggerBrowserAuth();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to launch browser authentication",
      chromeOpened: false,
    });
  }
});

router.get("/auth/poll", async (req: AuthRequest, res: Response) => {
  try {
    const result = await pollAuthCookies(req.userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      authenticated: false,
      message: "Failed to poll authentication status",
    });
  }
});

router.get("/auth/cookies", async (req: AuthRequest, res: Response) => {
  try {
    const cookies = await getCookies(req.userId!, "instagram");
    res.json({
      provider: "instagram",
      authenticated: Boolean(cookies),
      cookieCount: cookies?.count ?? 0,
      expiresAt: cookies?.expiresAt?.toISOString() ?? null,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to load cookie status" });
  }
});

router.delete("/auth/cookies", async (req: AuthRequest, res: Response) => {
  try {
    await deleteCookies(req.userId!, "instagram");
    res.json({ message: "Instagram session removed" });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to remove cookies" });
  }
});

router.post("/analyze", async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "URL is required" });
      return;
    }

    const result = await analyzeInstagramUrl(url, req.userId);
    res.json(result);
  } catch (error: any) {
    const message = error?.message || "Analysis failed";
    res.status(400).json({ error: message });
  }
});

export default router;
