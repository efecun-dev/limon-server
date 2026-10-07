import { NextResponse } from "next/server";
import { withCors } from "@/lib/cors";

export async function GET() {
  const owner = process.env.GITHUB_REPO_OWNER || "efecun-dev";
  const repo = process.env.GITHUB_REPO_NAME || "limon-panel";
  const token = process.env.GITHUB_UPDATE_TOKEN;

  if (!token) {
    return withCors(
      NextResponse.json({ error: "GITHUB_UPDATE_TOKEN is not configured on server" }, { status: 500 })
    );
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: {
        "User-Agent": "Limon-Server-Updater",
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const err = await res.text();
      return withCors(NextResponse.json({ error: "GitHub API Error", details: err }, { status: res.status }));
    }

    const release = await res.json();
    const exeAsset = release.assets?.find((a: any) => a.name.endsWith(".exe"));
    const ymlAsset = release.assets?.find((a: any) => a.name === "latest.yml");

    const data = {
      tag: release.tag_name,
      name: release.name,
      publishedAt: release.published_at,
      body: release.body,
      exeAsset: exeAsset ? {
        name: exeAsset.name,
        size: exeAsset.size,
        downloadUrl: `/api/updates/download?assetId=${exeAsset.id}&filename=${encodeURIComponent(exeAsset.name)}`,
      } : null,
      latestYmlUrl: ymlAsset ? `/api/updates/download?assetId=${ymlAsset.id}&filename=latest.yml` : null,
      assets: release.assets?.map((a: any) => ({
        id: a.id,
        name: a.name,
        size: a.size,
      })),
    };

    return withCors(NextResponse.json({ success: true, release: data }));
  } catch (error: any) {
    return withCors(NextResponse.json({ error: error.message }, { status: 500 }));
  }
}
