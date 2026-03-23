"""Cloudflare Worker entrypoint for building FLUX preset binaries in memory."""

from js import JSON, Uint8Array  # type: ignore[import-not-found]
from workers import Response, WorkerEntrypoint  # type: ignore[import-not-found]

from fluxmo.preset import build_preset_bytes

CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-expose-headers": "content-disposition, content-type",
}


def _payload_to_python(payload):
    return payload.to_py() if hasattr(payload, "to_py") else payload


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = dict(CORS_HEADERS)
    if extra:
        headers.update(extra)
    return headers


def _json_error(message: str, status: int) -> Response:
    return Response(
        JSON.stringify({"error": message}),
        status=status,
        headers=_headers({"content-type": "application/json; charset=utf-8"}),
    )


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        from urllib.parse import urlparse

        path = urlparse(request.url).path
        if not path.startswith("/api/"):
            return await self.env.ASSETS.fetch(request)

        if request.method == "OPTIONS":
            return Response(status=204, headers=_headers())

        if request.method != "POST":
            return _json_error("Method not allowed. Use POST.", 405)

        content_type = request.headers.get("content-type", "")
        if "application/json" not in content_type.lower():
            return _json_error(
                "Unsupported content type. Expected application/json.", 415
            )

        try:
            payload = await request.json()
        except Exception as exc:
            return _json_error(f"Invalid JSON body: {exc}", 400)

        try:
            preset_bytes = build_preset_bytes(_payload_to_python(payload))
        except ValueError as exc:
            return _json_error(str(exc), 400)

        return Response(
            Uint8Array.new(preset_bytes),
            headers=_headers(
                {
                    "content-type": "application/octet-stream",
                    "content-disposition": 'attachment; filename="preset.TXT"',
                    "cache-control": "no-store",
                }
            ),
        )
