import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  const { pathname } = request.nextUrl

  // 1. Protect all /dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!token) {
      const loginUrl = new URL('/', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  // 2. Redirect logged-in users away from auth pages to /dashboard/chat directly
  if (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/signup')
  ) {
    if (token) {
      const chatUrl = new URL('/dashboard/chat', request.url)
      return NextResponse.redirect(chatUrl)
    }
  }

  // 3. Redirect direct /dashboard requests to /dashboard/chat (Chat as Main Page)
  if (pathname === '/dashboard') {
    const chatUrl = new URL('/dashboard/chat', request.url)
    return NextResponse.redirect(chatUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/login',
    '/register',
    '/signup',
  ],
}
