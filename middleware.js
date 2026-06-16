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
    // захищені React-сторінки → старий /login (статичні кабінети захищені на клієнті через /api/me)
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  // ВАЖЛИВО: не вписувати сюди статичні .html з public/ — на Vercel такий файл
  // не віддається статичним шаром і дає 404. Захист kabinet.html — на клієнті (fetch /api/me).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.).*)'],
}
