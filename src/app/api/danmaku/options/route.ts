import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { mergeLunaDanmakuOptions } from '@/lib/danmaku/options';
import { LunaDanmakuOptions } from '@/lib/danmaku/types';

export const runtime = 'nodejs';

async function getAuthorizedUsername(request: NextRequest, requireAdmin = false) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) return null;

  const config = await getConfig();
  if (authInfo.username !== process.env.USERNAME) {
    const user = config.UserConfig.Users.find(
      (item) => item.username === authInfo.username
    );
    if (!user || user.banned || (requireAdmin && user.role !== 'admin')) {
      return null;
    }
  }

  return authInfo.username;
}

export async function GET(request: NextRequest) {
  try {
    const username = await getAuthorizedUsername(request);
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getConfig();
    return NextResponse.json({ source: config.DanmakuSource }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : '获取弹幕源设置失败',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await getAuthorizedUsername(request, true))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<LunaDanmakuOptions>;
    const options = mergeLunaDanmakuOptions(body);
    const config = await getConfig();
    config.DanmakuSource = options.source;
    await db.saveAdminConfig(config);

    return NextResponse.json({ success: true, source: options.source }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : '保存弹幕源设置失败',
      },
      { status: 500 }
    );
  }
}
