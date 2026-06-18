import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { serverRestoreContact } from '@/lib/api/nestjs-server-client';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const result = await serverRestoreContact(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    revalidatePath('/admin/contacts');
    revalidatePath(`/admin/contacts/${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
