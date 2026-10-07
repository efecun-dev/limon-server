import { NextResponse } from "next/server";
import os from "os";
import fs from "fs";
import { withCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    // 1. CPU Bilgileri
    const cpus = os.cpus();
    const cpuModel = cpus && cpus.length > 0 ? cpus[0].model : "Bilinmiyor";
    const cpuCores = cpus ? cpus.length : 1;

    // CPU kullanım hesaplama
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    }
    const cpuUsagePercent = Math.min(100, Math.max(1, Math.round((1 - totalIdle / totalTick) * 100)));

    // 2. RAM / Bellek Bilgileri
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;
    const memUsagePercent = Math.round((usedMemBytes / totalMemBytes) * 100);

    const memoryUsage = process.memoryUsage();

    // 3. Disk / SSD Depolama Bilgileri
    let diskTotalGb = 0;
    let diskFreeGb = 0;
    let diskUsedGb = 0;
    let diskUsagePercent = 0;

    try {
      if (typeof fs.statfsSync === "function") {
        const stat = fs.statfsSync(process.cwd());
        const totalBytes = stat.bsize * stat.blocks;
        const freeBytes = stat.bsize * stat.bfree;
        const usedBytes = totalBytes - freeBytes;

        diskTotalGb = Number((totalBytes / 1e9).toFixed(1));
        diskFreeGb = Number((freeBytes / 1e9).toFixed(1));
        diskUsedGb = Number((usedBytes / 1e9).toFixed(1));
        diskUsagePercent = diskTotalGb > 0 ? Math.round((diskUsedGb / diskTotalGb) * 100) : 0;
      }
    } catch (diskErr) {
      console.warn("Disk bilgisi alınamadı:", diskErr);
    }

    // 4. Sistem ve Uptime
    const systemUptimeSeconds = os.uptime();
    const processUptimeSeconds = Math.floor(process.uptime());

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      cpu: {
        model: cpuModel,
        cores: cpuCores,
        usagePercent: cpuUsagePercent,
        loadAverage: os.loadavg().map((l) => Number(l.toFixed(2))),
        arch: os.arch(),
      },
      memory: {
        totalGb: Number((totalMemBytes / 1e9).toFixed(2)),
        usedGb: Number((usedMemBytes / 1e9).toFixed(2)),
        freeGb: Number((freeMemBytes / 1e9).toFixed(2)),
        usagePercent: memUsagePercent,
        nodeHeapUsedMb: Number((memoryUsage.heapUsed / 1e6).toFixed(1)),
        nodeHeapTotalMb: Number((memoryUsage.heapTotal / 1e6).toFixed(1)),
        nodeRssMb: Number((memoryUsage.rss / 1e6).toFixed(1)),
      },
      disk: {
        totalGb: diskTotalGb,
        usedGb: diskUsedGb,
        freeGb: diskFreeGb,
        usagePercent: diskUsagePercent,
        path: process.cwd(),
      },
      os: {
        platform: os.platform(),
        type: os.type(),
        release: os.release(),
        hostname: os.hostname(),
        systemUptimeSeconds,
        processUptimeSeconds,
        nodeVersion: process.version,
        pid: process.pid,
      },
    };

    return withCors(NextResponse.json(result));
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Sistem bilgileri alınamadı.", error: error.message },
        { status: 500 }
      )
    );
  }
}
