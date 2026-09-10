import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

type AddressComponent = { long_name: string; types: string[] };

function extract(components: AddressComponent[], type: string): string {
  return components.find((c) => c.types.includes(type))?.long_name ?? "";
}

export async function GET(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google Places API nicht konfiguriert" }, { status: 503 });
  }

  const placeId = request.nextUrl.searchParams.get("place_id");
  if (!placeId) return NextResponse.json({ error: "place_id erforderlich" }, { status: 400 });

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "name,formatted_phone_number,international_phone_number,website,address_components,formatted_address",
    language: "de",
    key: apiKey,
  });

  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  if (!res.ok) return NextResponse.json({ error: "Google API Fehler" }, { status: 500 });

  const data = await res.json();
  const r = data.result ?? {};
  const components: AddressComponent[] = r.address_components ?? [];

  return NextResponse.json({
    phone: r.international_phone_number ?? r.formatted_phone_number ?? null,
    website: r.website ?? null,
    formatted_address: r.formatted_address ?? "",
    address: {
      street: extract(components, "route"),
      house_number: extract(components, "street_number"),
      zip_code: extract(components, "postal_code"),
      city:
        extract(components, "locality") ||
        extract(components, "sublocality") ||
        extract(components, "administrative_area_level_2"),
      country: extract(components, "country") || "Deutschland",
    },
  });
}
