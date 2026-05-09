import { NextResponse } from "next/server";
import axios from "axios";

export const runtime = "nodejs";
export const maxDuration = 60;

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    console.log(`[Next.js API] Proxying info request to: ${BACKEND_URL}/info`);
    
    const response = await axios.post(`${BACKEND_URL}/info`, { url }, {
      timeout: 55000,
      headers: { 'Content-Type': 'application/json' }
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error("[Next.js API] Proxy Error:", error.message);
    
    const status = error.response?.status || 500;
    const errorData = error.response?.data || { error: "Error de comunicación con el motor de descarga." };
    
    return NextResponse.json(errorData, { status });
  }
}

