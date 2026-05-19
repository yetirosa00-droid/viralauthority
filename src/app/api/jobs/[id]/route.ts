import { NextResponse } from 'next/server';
import { getJob } from '@/lib/queue';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const job = getJob(id);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Trabajo no encontrado en la cola de producción.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        duration: job.duration,
        resultText: job.resultText,
        improvedText: job.improvedText,
        segments: job.segments,
        errorMessage: job.errorMessage
      }
    });

  } catch (error: any) {
    console.error('GET Job API Fatal Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al obtener estado de transcripción.' },
      { status: 500 }
    );
  }
}
