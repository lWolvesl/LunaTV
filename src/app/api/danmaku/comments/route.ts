import { NextRequest, NextResponse } from 'next/server';

import {
  LunaDanmakuCommentsRequest,
  LunaDanmakuCommentsResponse,
} from '@/lib/danmaku/types';
import { fetchDanmakuFromCandidate } from '@/lib/danmaku/providers';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LunaDanmakuCommentsRequest;
    const response: LunaDanmakuCommentsResponse =
      await fetchDanmakuFromCandidate(body.candidate, body.source);

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Invalid danmaku comments request',
      },
      { status: 400 }
    );
  }
}
