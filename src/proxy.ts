import { NextResponse, type NextRequest } from "next/server";
const SESSION_COOKIE = "coordinador_session";
export function proxy(request: NextRequest) {
  if (!request.cookies.get(SESSION_COOKIE)?.value)
    return NextResponse.redirect(new URL("/ingresar", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/app/:path*"] };
