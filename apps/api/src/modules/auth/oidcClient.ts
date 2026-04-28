/**
 * OIDC client setup for Google and Microsoft.
 *
 * Each provider is lazily initialised so we don't fail at import time if
 * environment variables are missing (they are validated in server.ts).
 */

import { Issuer, generators, BaseClient } from "openid-client";

export type Provider = "google" | "microsoft";

interface OidcClients {
  google?: BaseClient;
  microsoft?: BaseClient;
}

const clients: OidcClients = {};

/** Discover and cache an OIDC client for the given provider. */
export async function getClient(provider: Provider): Promise<BaseClient> {
  if (clients[provider]) return clients[provider]!;

  const callbackUrl = process.env.OAUTH_CALLBACK_URL;
  if (!callbackUrl) throw new Error("OAUTH_CALLBACK_URL is not set");

  if (provider === "google") {
    const clientId = process.env.OAUTH_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.OAUTH_GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret)
      throw new Error("Google OAuth credentials are not configured");

    const issuer = await Issuer.discover("https://accounts.google.com");
    clients.google = new issuer.Client({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [`${callbackUrl}/google`],
      response_types: ["code"],
    });
    return clients.google;
  }

  if (provider === "microsoft") {
    const clientId = process.env.OAUTH_MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.OAUTH_MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret)
      throw new Error("Microsoft OAuth credentials are not configured");

    const issuer = await Issuer.discover(
      "https://login.microsoftonline.com/common/v2.0",
    );
    clients.microsoft = new issuer.Client({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [`${callbackUrl}/microsoft`],
      response_types: ["code"],
    });
    return clients.microsoft;
  }

  throw new Error(`Unknown provider: ${provider}`);
}

/** Generate a PKCE pair + state nonce and return them along with the auth URL. */
export async function buildAuthorizationUrl(
  provider: Provider,
): Promise<{ url: string; state: string; codeVerifier: string }> {
  const client = await getClient(provider);
  const state = generators.state();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);

  const url = client.authorizationUrl({
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return { url, state, codeVerifier };
}
