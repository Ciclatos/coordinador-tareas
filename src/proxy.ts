import { NextResponse, type NextRequest } from "next/server";
const SESSION_COOKIE = "coordinador_session";
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/entregar/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
  if (request.nextUrl.pathname.startsWith("/app") && !request.cookies.get(SESSION_COOKIE)?.value)
    return NextResponse.redirect(new URL("/ingresar", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/app/:path*", "/entregar/:path*"] };
