import { NextResponse } from "next/server";
import axios from "axios";

export const runtime = "nodejs";
export const maxDuration = 120; // High duration for large downloads

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    console.log(`[Next.js API] Proxying download request to: ${BACKEND_URL}/download`);
    
    const response = await axios.post(`${BACKEND_URL}/download`, payload, {
      timeout: 110000,
      headers: { 'Content-Type': 'application/json' }
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error("[Next.js API] Download Proxy Error:", error.message);
    
    const status = error.response?.status || 500;
    const errorData = error.response?.data || { error: "Error al iniciar la descarga desde el motor." };
    
    return NextResponse.json(errorData, { status });
  }
}
