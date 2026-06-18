import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  const originalPath =
    'https://yjlaser.net/webhard/1764220960385-rtx952c9-1107-7 신영 농업법인 주)도담 리본표지발이 속겉지(대) 목형   갱지 600-500  80.DXF';

  const baseUrl = 'https://yjlaser.net/webhard/';
  const filename =
    '1764220960385-rtx952c9-1107-7 신영 농업법인 주)도담 리본표지발이 속겉지(대) 목형   갱지 600-500  80.DXF';

  // Variations to try
  const variations = [
    { name: 'Original (encoded)', url: new URL(originalPath).href },
    { name: 'Fully Encoded Filename', url: baseUrl + encodeURIComponent(filename) },
    { name: 'Encoded Spaces Only', url: baseUrl + filename.replace(/ /g, '%20') },
  ];

  const results = [];

  for (const v of variations) {
    try {
      const res = await fetch(v.url, { method: 'HEAD' });
      results.push({
        name: v.name,
        url: v.url,
        status: res.status,
        statusText: res.statusText,
      });
    } catch (e) {
      results.push({
        name: v.name,
        url: v.url,
        error: String(e),
      });
    }
  }

  return NextResponse.json({ results });
}
