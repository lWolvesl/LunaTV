import { NextRequest, NextResponse } from 'next/server';

import {
  LunaDanmakuSearchRequest,
  LunaDanmakuSearchResponse,
} from '@/lib/danmaku/types';
import { searchDanmakuProviders } from '@/lib/danmaku/providers';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LunaDanmakuSearchRequest;
    const context = body.context;

    if (!context.title && !context.searchTitle) {
      return NextResponse.json(
        { error: 'Missing danmaku matching context' },
        { status: 400 }
      );
    }

    const response: LunaDanmakuSearchResponse = {
      context,
      candidates: await searchDanmakuProviders(
        context,
        body.source,
        body.includeAllEpisodes
      ),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Invalid danmaku matching request',
      },
      { status: 400 }
    );
  }
}
