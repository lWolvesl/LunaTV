import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { mergeLunaDanmakuOptions } from '@/lib/danmaku/options';
import { LunaDanmakuOptions } from '@/lib/danmaku/types';

export const runtime = 'nodejs';

const DANMAKU_SOURCE_SETTING_KEY = 'danmaku:source';

async function getAuthorizedUsername(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) return null;

  const config = await getConfig();
  if (authInfo.username !== process.env.USERNAME) {
    const user = config.UserConfig.Users.find(
      (item) => item.username === authInfo.username
    );
    if (!user || user.banned) return null;
  }

  return authInfo.username;
}

export async function GET(request: NextRequest) {
  try {
    const username = await getAuthorizedUsername(request);
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const setting = await db.getUserSetting(username, DANMAKU_SOURCE_SETTING_KEY);
    return NextResponse.json(
      { source: (setting?.value as LunaDanmakuOptions['source']) || null },
      { status: 200 }
    );
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
    const username = await getAuthorizedUsername(request);
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<LunaDanmakuOptions>;
    const options = mergeLunaDanmakuOptions(body);

    await db.setUserSetting(username, DANMAKU_SOURCE_SETTING_KEY, {
      value: options.source,
      update_time: Date.now(),
    });

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
