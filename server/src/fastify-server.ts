import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

process.loadEnvFile();

const PORT = 3000;

const SPOTIFY_FETCH_TIMEOUT_MS = 5000;

const SpotifyTokenResponse = Type.Object({
  access_token: Type.String(),
});

async function getSpotifyAccessToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(SPOTIFY_FETCH_TIMEOUT_MS),
  });
  const rawData = await response.json();
  const data = Value.Parse(SpotifyTokenResponse, rawData);
  return data.access_token;
}

const HealthResponse = Type.Object({
  status: Type.String(),
});

const Track = Type.Object({
  id: Type.String(),
  name: Type.String(),
  artists: Type.Array(Type.String()),
  albumImageUrl: Type.Optional(Type.String()),
  previewUrl: Type.Optional(Type.String()),
});

const SearchResponse = Type.Object({
  tracks: Type.Array(Track),
});

const BadRequest = Type.Object({
  statusCode: Type.Integer(),
  code: Type.String(),
  error: Type.String(),
  message: Type.String(),
});

const ErrorResponse = Type.Object({
  error: Type.String(),
});

const SpotifyTrackSearchItem = Type.Object({
  id: Type.String(),
  name: Type.String(),
  artists: Type.Array(Type.Object({ name: Type.String() })),
  album: Type.Object({
    images: Type.Array(Type.Object({ url: Type.String() })),
  }),
  preview_url: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const SpotifyTrackSearchApiResponse = Type.Object({
  tracks: Type.Object({
    items: Type.Array(SpotifyTrackSearchItem),
  }),
});

export async function buildApp() {
  const fastify = Fastify({
    logger: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: "MoodHub Server API",
        version: "0.1.0",
      },
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: "/documentation",
  });

  fastify.get(
    "/health",
    {
      schema: {
        response: {
          200: HealthResponse,
        },
      },
    },
    (request, reply) => {
      return { status: "ok" };
    },
  );

  fastify.get(
    "/search",
    {
      schema: {
        querystring: Type.Object({
          artist: Type.String(),
        }),
        response: {
          200: SearchResponse,
          400: BadRequest,
          502: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { artist } = request.query;
      try {
        const accessToken = await getSpotifyAccessToken();

        const spotifyResponse = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(`artist:${artist}`)}&type=track`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal: AbortSignal.timeout(SPOTIFY_FETCH_TIMEOUT_MS),
          },
        );
        const rawData = await spotifyResponse.json();

        const data = Value.Parse(SpotifyTrackSearchApiResponse, rawData);

        const tracks = data.tracks.items.map((item) => ({
          id: item.id,
          name: item.name,
          artists: item.artists.map((a) => a.name),
          albumImageUrl: item.album.images[0]?.url,
          previewUrl: item.preview_url ?? undefined,
        }));

        return { tracks };
      } catch (error) {
        reply
          .code(502)
          .send({ error: "Spotifyから予期しない形式のレスポンスが返されました" });
      }
    },
  );

  return fastify;
}

if (import.meta.main) {
  const fastify = await buildApp();
  fastify.listen({ port: PORT }, (err) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  });
}
