import type Browser from "webextension-polyfill";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

const CONFIG_KEY = "fdial/calendar/google-auth-config";
const TOKEN_KEY = "fdial/calendar/google-token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

type GoogleAuthConfig = { clientId: string };
type GoogleTokenRecord = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
};

type ChromeAuthTokenResult = string | { token?: string } | undefined;
type ChromeIdentity = {
  getAuthToken: (
    details: { interactive: boolean; scopes: readonly string[] },
    callback: (result: ChromeAuthTokenResult) => void,
  ) => void;
  removeCachedAuthToken: (
    details: { token: string },
    callback: () => void,
  ) => void;
};
type ChromeApi = {
  identity?: ChromeIdentity;
  runtime?: { lastError?: { message?: string } };
};

function chromeApi(): ChromeApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

function randomBase64Url(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

async function getConfig(): Promise<GoogleAuthConfig | undefined> {
  const stored = await browser.storage.local.get(CONFIG_KEY);
  const config = stored[CONFIG_KEY] as Partial<GoogleAuthConfig> | undefined;
  return config && typeof config.clientId === "string"
    ? { clientId: config.clientId }
    : undefined;
}

async function getTokenRecord(): Promise<GoogleTokenRecord | undefined> {
  const stored = await browser.storage.local.get(TOKEN_KEY);
  const token = stored[TOKEN_KEY] as Partial<GoogleTokenRecord> | undefined;
  if (
    !token ||
    typeof token.accessToken !== "string" ||
    typeof token.expiresAt !== "number"
  ) {
    return undefined;
  }
  return {
    accessToken: token.accessToken,
    refreshToken:
      typeof token.refreshToken === "string" ? token.refreshToken : undefined,
    expiresAt: token.expiresAt,
    scope: typeof token.scope === "string" ? token.scope : undefined,
  };
}

function nativeIdentityEnabled(clientId: string): boolean {
  return (
    BUILD_TARGET === "chromium" &&
    Boolean(GOOGLE_CALENDAR_CLIENT_ID) &&
    clientId === GOOGLE_CALENDAR_CLIENT_ID &&
    Boolean(chromeApi()?.identity)
  );
}

async function nativeAccessToken(interactive: boolean): Promise<string> {
  const api = chromeApi();
  if (!api?.identity) throw new Error("Chrome Identity is unavailable");
  return new Promise((resolve, reject) => {
    api.identity!.getAuthToken(
      { interactive, scopes: GOOGLE_CALENDAR_SCOPES },
      (result) => {
        const error = api.runtime?.lastError?.message;
        if (error) {
          reject(new Error(error));
          return;
        }
        const token = typeof result === "string" ? result : result?.token;
        if (!token) {
          reject(new Error("Google did not return an access token"));
          return;
        }
        resolve(token);
      },
    );
  });
}

async function removeNativeToken(token: string): Promise<void> {
  const api = chromeApi();
  if (!api?.identity) return;
  await new Promise<void>((resolve) => {
    api.identity!.removeCachedAuthToken({ token }, resolve);
  });
}

export function googleOAuthRedirectUrl(): string {
  const generated = browser.identity.getRedirectURL("google-calendar");
  if (BUILD_TARGET !== "firefox") return generated;
  const subdomain = new URL(generated).hostname.split(".")[0];
  return `http://127.0.0.1/mozoauth2/${subdomain}`;
}

export function compiledGoogleClientId(): string {
  return GOOGLE_CALENDAR_CLIENT_ID;
}

export async function configuredGoogleClientId(): Promise<string> {
  const config = await getConfig();
  return config?.clientId || GOOGLE_CALENDAR_CLIENT_ID;
}

export async function saveGoogleClientId(clientId: string): Promise<void> {
  await browser.storage.local.set({
    [CONFIG_KEY]: { clientId: clientId.trim() },
  });
}

async function parseTokenResponse(
  response: Response,
  previousRefreshToken?: string,
): Promise<GoogleTokenRecord> {
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || typeof body.access_token !== "string") {
    const description =
      typeof body.error_description === "string"
        ? body.error_description
        : `Google token request failed with HTTP ${response.status}`;
    throw new Error(description);
  }
  return {
    accessToken: body.access_token,
    refreshToken:
      typeof body.refresh_token === "string"
        ? body.refresh_token
        : previousRefreshToken,
    expiresAt:
      Date.now() + Math.max(60, Number(body.expires_in) || 3_600) * 1_000,
    scope: typeof body.scope === "string" ? body.scope : undefined,
  };
}

async function storeToken(token: GoogleTokenRecord): Promise<void> {
  await browser.storage.local.set({ [TOKEN_KEY]: token });
}

async function refreshPkceToken(
  clientId: string,
  token: GoogleTokenRecord,
): Promise<string> {
  if (!token.refreshToken)
    throw new Error("Google Calendar needs reconnecting");
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: token.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const refreshed = await parseTokenResponse(response, token.refreshToken);
  await storeToken(refreshed);
  return refreshed.accessToken;
}

async function authorizePkce(clientId: string): Promise<string> {
  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomBase64Url(24);
  const redirectUri = googleOAuthRedirectUrl();
  const authorization = new URL(AUTH_ENDPOINT);
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("access_type", "offline");
  authorization.searchParams.set("prompt", "consent");
  authorization.searchParams.set("include_granted_scopes", "true");

  const redirect = await browser.identity.launchWebAuthFlow({
    interactive: true,
    url: authorization.href as Browser.Manifest.HttpURL,
  });
  const result = new URL(redirect);
  const parameters = result.searchParams.has("code")
    ? result.searchParams
    : new URLSearchParams(result.hash.slice(1));
  if (parameters.get("state") !== state) {
    throw new Error("Google OAuth state verification failed");
  }
  const oauthError = parameters.get("error");
  if (oauthError) throw new Error(`Google authorization failed: ${oauthError}`);
  const code = parameters.get("code");
  if (!code) throw new Error("Google did not return an authorization code");

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const token = await parseTokenResponse(response);
  await storeToken(token);
  return token.accessToken;
}

export async function connectGoogleCalendar(clientId: string): Promise<string> {
  const normalized = clientId.trim();
  if (!normalized) throw new Error("A Google OAuth client ID is required");
  await saveGoogleClientId(normalized);
  return nativeIdentityEnabled(normalized)
    ? nativeAccessToken(true)
    : authorizePkce(normalized);
}

export async function getGoogleAccessToken(
  interactive = false,
): Promise<string> {
  const clientId = await configuredGoogleClientId();
  if (!clientId) throw new Error("Google OAuth client ID is not configured");
  if (nativeIdentityEnabled(clientId)) return nativeAccessToken(interactive);
  const token = await getTokenRecord();
  if (token && token.accessToken && token.expiresAt > Date.now() + 60_000) {
    return token.accessToken;
  }
  if (token?.refreshToken) return refreshPkceToken(clientId, token);
  if (interactive) return authorizePkce(clientId);
  throw new Error("Google Calendar needs reconnecting");
}

export async function invalidateGoogleAccessToken(
  token: string,
): Promise<void> {
  const clientId = await configuredGoogleClientId();
  if (nativeIdentityEnabled(clientId)) {
    await removeNativeToken(token);
    return;
  }
  const existing = await getTokenRecord();
  if (existing) {
    await storeToken({ ...existing, accessToken: "", expiresAt: 0 });
  }
}

export async function disconnectGoogleCalendar(): Promise<void> {
  let token: string | undefined;
  try {
    token = await getGoogleAccessToken(false);
  } catch {
    token = (await getTokenRecord())?.refreshToken;
  }
  if (token) {
    await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }).catch(() => undefined);
    await removeNativeToken(token);
  }
  await browser.storage.local.remove([TOKEN_KEY]);
}
