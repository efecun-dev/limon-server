import { NextRequest, NextResponse } from "next/server";
import { withCors } from "@/lib/cors";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get("assetId");
  const filename = searchParams.get("filename") || "Limon-Panel-Setup.exe";

  const owner = process.env.GITHUB_REPO_OWNER || "efecun-dev";
  const repo = process.env.GITHUB_REPO_NAME || "limon-panel";
  const token = process.env.GITHUB_UPDATE_TOKEN;

  if (!assetId || !token) {
    return withCors(NextResponse.json({ error: "Missing assetId or GITHUB_UPDATE_TOKEN" }, { status: 400 }));
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetId}`, {
      headers: {
        "User-Agent": "Limon-Server-Downloader",
        Authorization: `Bearer ${token}`,
        Accept: "application/octet-stream",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return withCors(NextResponse.json({ error: "Failed to download asset from GitHub" }, { status: res.status }));
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    if (res.headers.get("content-length")) {
      headers.set("Content-Length", res.headers.get("content-length")!);
    }
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(res.body, { status: 200, headers });
  } catch (error: any) {
    return withCors(NextResponse.json({ error: error.message }, { status: 500 }));
  }
}
