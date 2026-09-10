import { NextResponse } from "next/server";

// This endpoint is deprecated — classification is now handled by /api/emails/[id]/classify
export async function GET() {
  return NextResponse.json({ message: "Recategorize is deprecated. Use /api/emails/[id]/classify instead." });
}
export async function POST() {
  return NextResponse.json({ message: "Recategorize is deprecated. Use /api/emails/[id]/classify instead." });
}
