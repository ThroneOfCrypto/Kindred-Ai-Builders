import { NextResponse } from "next/server";

import { getEntry, isValidTypeDir, makeImportPin, type MarketplaceTypeDir } from "../../../../lib/marketplace_catalog";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "";
  const slug = url.searchParams.get("slug") || "";

  if (!isValidTypeDir(type) || !slug) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const entry = await getEntry(type as MarketplaceTypeDir, slug);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pin = makeImportPin(entry);
  const filename = `import_pin__${type}__${slug}.json`;

  return new NextResponse(JSON.stringify(pin, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename=\"${filename}\"`,
      "cache-control": "no-store",
    },
  });
}
