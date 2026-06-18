interface ForwardedCookie {
  name: string;
  value: string;
}

function encodeByteStringCharacter(character: string): string {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined || codePoint <= 255) {
    return character;
  }

  return encodeURIComponent(character);
}

function encodeCookiePartCharacter(character: string): string {
  const codePoint = character.codePointAt(0);
  if (
    codePoint === undefined ||
    codePoint > 255 ||
    character === ';' ||
    character === '\r' ||
    character === '\n' ||
    character === '\t' ||
    character === ' '
  ) {
    return encodeURIComponent(character);
  }

  return character;
}

function encodeCookiePart(value: string): string {
  return Array.from(value).map(encodeCookiePartCharacter).join('');
}

export function toByteStringHeaderValue(value: string | null): string | undefined {
  if (!value) return undefined;
  return Array.from(value).map(encodeByteStringCharacter).join('');
}

export function buildForwardedCookieHeader(cookies: readonly ForwardedCookie[]): string {
  return cookies
    .map((cookie) => `${encodeCookiePart(cookie.name)}=${encodeCookiePart(cookie.value)}`)
    .join('; ');
}

export function sanitizeForwardedCookieHeader(cookieHeader: string): string {
  if (!cookieHeader) return '';

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) {
        return encodeCookiePart(part);
      }

      const name = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      return `${encodeCookiePart(name)}=${encodeCookiePart(value)}`;
    })
    .join('; ');
}
