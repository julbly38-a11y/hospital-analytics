import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const publicPaths = ['/', '/login', '/auth', '/_next', '/favicon.ico', '/api', '/title-test', '/khotyn_slide.html']
  const isPublic = publicPaths.some(p => request.nextUrl.pathname === p || (p !== '/' && request.nextUrl.pathname.startsWith(p)))

  if (!user && !isPublic) {
    // вхід для кабінету — статичний слайд (page 1), для решти захищених сторінок — старий /login
    const dest = request.nextUrl.pathname === '/cabinet.html' ? '/khotyn_slide.html' : '/login'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.).*)', '/cabinet.html'],
}
