import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { withCors } from "@/lib/cors";
import { BRANCHES } from "@/lib/branches";

export async function GET() {
  const startTime = Date.now();
  let redisStatus = "disconnected";
  let redisPingMs: number | null = null;

  try {
    const t0 = Date.now();
    const ping = await redis.ping();
    redisPingMs = Date.now() - t0;
    if (ping === "PONG") redisStatus = "connected";
  } catch (e: any) {
    redisStatus = "error: " + e.message;
  }

  let postgresStatus = "disconnected";
  let postgresPingMs: number | null = null;

  if (process.env.DATABASE_URL) {
    try {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      postgresPingMs = Date.now() - t0;
      postgresStatus = "connected";
    } catch (e: any) {
      postgresStatus = "error: " + (e.message || "Bağlantı hatası");
    }
  } else {
    postgresStatus = "not_configured";
  }

  const memory = process.memoryUsage();

  const response = NextResponse.json({
    status: "healthy",
    service: "Limon Central API Server",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    integrations: {
      redis: redisStatus,
      postgresql: postgresStatus,
      trendyolApi: !!process.env.TRENDYOL_API_KEY,
      telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      githubUpdateToken: !!process.env.GITHUB_UPDATE_TOKEN,
    },
    version: "1.0.0",
    telemetry: {
      nodeVersion: process.version,
      platform: `${process.platform} (${process.arch})`,
      pid: process.pid,
      environment: process.env.NODE_ENV || "development",
      port: process.env.PORT || "3001",
      executionTimeMs: Date.now() - startTime,
      memory: {
        rssMb: Number((memory.rss / (1024 * 1024)).toFixed(1)),
        heapUsedMb: Number((memory.heapUsed / (1024 * 1024)).toFixed(1)),
        heapTotalMb: Number((memory.heapTotal / (1024 * 1024)).toFixed(1)),
        externalMb: Number((memory.external / (1024 * 1024)).toFixed(1)),
      },
      services: {
        postgresql: {
          status: postgresStatus,
          pingMs: postgresPingMs,
          configured: !!process.env.DATABASE_URL,
        },
        redis: {
          status: redisStatus,
          pingMs: redisPingMs,
          target: process.env.REDIS_URL ? "configured" : "localhost:6379",
        },
        trendyol: {
          status: process.env.TRENDYOL_API_KEY ? "active" : "configured",
          branchesCount: Object.keys(BRANCHES).length,
          partnerId: process.env.TRENDYOL_PARTNER_ID ? "configured" : "default",
        },
        telegram: {
          status: process.env.TELEGRAM_BOT_TOKEN ? "active" : "standby",
        },
        github: {
          status: process.env.GITHUB_UPDATE_TOKEN ? "active" : "standby",
        },
        security: {
          jwtSecret: !!process.env.JWT_SECRET,
          serverKey: !!process.env.SERVER_KEY,
          cors: "configured",
        },
      },
    },
  });

  return withCors(response);
}
