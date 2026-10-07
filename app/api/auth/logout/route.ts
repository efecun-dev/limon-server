import { NextResponse } from "next/server";
import { withCors } from "@/lib/cors";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Çıkış yapıldı." }, { status: 200 });

  response.cookies.set({
    name: "auth-token",
    value: "",
    path: "/",
    maxAge: 0,
  });

  return withCors(response);
}
