import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

export async function GET(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google Places API nicht konfiguriert" }, { status: 503 });
  }

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") ?? "";
  const city = searchParams.get("city") ?? "";
  const pagetoken = searchParams.get("pagetoken") ?? "";

  if (!q) return NextResponse.json({ error: "Suchbegriff erforderlich" }, { status: 400 });

  const query = city ? `${q} ${city}` : `${q} Deutschland`;

  const params = new URLSearchParams({ query, region: "de", language: "de", key: apiKey });
  if (pagetoken) params.set("pagetoken", pagetoken);

  const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
  if (!res.ok) return NextResponse.json({ error: "Google API Fehler" }, { status: 500 });

  const data = await res.json();
  if (data.status === "REQUEST_DENIED") {
    return NextResponse.json({ error: data.error_message ?? "API-Key ungültig" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = (data.results ?? []).map((r: any) => ({
    place_id: r.place_id,
    name: r.name,
    address: r.formatted_address,
    types: (r.types ?? []).filter((t: string) => !["establishment", "point_of_interest"].includes(t)),
    rating: r.rating ?? null,
    user_ratings_total: r.user_ratings_total ?? 0,
  }));

  return NextResponse.json({ results, next_page_token: data.next_page_token ?? null });
}
