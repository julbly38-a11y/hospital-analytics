import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const publicPaths = ['/login']
  const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p))

  // Не авторизований → login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Авторизований → додаємо роль в header для API
  if (user) {
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role, empl_name_id')
      .eq('auth_user_id', user.id)
      .single()

    const role = appUser?.role || 'viewer'
    const emplId = appUser?.empl_name_id || ''

    // Передаємо роль в API через header
    supabaseResponse.headers.set('x-user-role', role)
    supabaseResponse.headers.set('x-user-empl-id', String(emplId))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
