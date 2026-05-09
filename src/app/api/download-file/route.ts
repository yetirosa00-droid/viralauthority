import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export const runtime = "nodejs";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");
  const name = searchParams.get("name");

  if (!file) {
    return NextResponse.json({ error: "File name is required" }, { status: 400 });
  }

  try {
    console.log(`[Next.js API] Proxying file download: ${file}`);
    
    // Call the backend /download-file route
    const response = await axios({
      method: "get",
      url: `${BACKEND_URL}/download-file`,
      params: { file, name },
      responseType: "stream",
    });

    // Create a readable stream from the axios response
    const stream = response.data;

    // Pass through headers
    const headers = new Headers();
    headers.set("Content-Disposition", response.headers["content-disposition"] || `attachment; filename="${name || file}"`);
    headers.set("Content-Type", response.headers["content-type"] || "application/octet-stream");
    if (response.headers["content-length"]) {
      headers.set("Content-Length", response.headers["content-length"]);
    }

    return new NextResponse(stream, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error("[Next.js API] File Proxy Error:", error.message);
    return NextResponse.json({ error: "Error al descargar el archivo." }, { status: 500 });
  }
}
