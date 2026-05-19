import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get('accessToken')?.value;

  const isProtectedStudent = pathname.startsWith('/my-courses') || pathname.startsWith('/learn') || pathname.startsWith('/chat');
  const isProtectedInstructor = pathname.startsWith('/instructor');
  const isProtectedAdmin = pathname.startsWith('/admin');
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');

  if ((isProtectedStudent || isProtectedInstructor || isProtectedAdmin) && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/my-courses/:path*', '/learn/:path*', '/chat/:path*', '/instructor/:path*', '/admin/:path*', '/login', '/register'],
};
