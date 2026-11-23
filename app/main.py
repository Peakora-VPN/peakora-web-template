import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException as StarletteHTTPException

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
ASSETS = SRC / "assets"
CONTACT = json.loads((SRC / "site.json").read_text(encoding="utf-8"))["contact"]

app = FastAPI(title="Peakora Network", docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/assets", StaticFiles(directory=ASSETS), name="assets")
templates = Jinja2Templates(directory=SRC)


def render_page(
    request: Request,
    template: str,
    *,
    title: str,
    description: str,
    nav: str | None = None,
    og_type: str = "website",
    status_code: int = 200,
):
    return templates.TemplateResponse(
        request=request,
        name=f"pages/{template}",
        context={
            "title": title,
            "description": description,
            "nav": nav,
            "og_type": og_type,
            "year": datetime.now(UTC).year,
            "contact": CONTACT,
        },
        status_code=status_code,
    )


@app.api_route(methods=["GET", "HEAD"], path="/")
def overview(request: Request):
    return render_page(
        request,
        "index.html",
        title="Peakora Network — Edge infrastructure",
        description="Explore the layers of edge delivery, follow a web request and inspect the real timing reported by your browser.",
        nav="overview",
    )


@app.api_route(methods=["GET", "HEAD"], path="/network/")
def network(request: Request):
    return render_page(
        request,
        "network.html",
        title="Network — Peakora Network",
        description="A practical reference to DNS, connections, secure transport, HTTP delivery and the browser timings that describe a page load.",
        nav="network",
    )


@app.api_route(methods=["GET", "HEAD"], path="/articles/")
def articles(request: Request):
    return render_page(
        request,
        "articles.html",
        title="Field notes — Peakora Network",
        description="Practical notes on name resolution, connection setup, reuse and the timings that describe a web response.",
        nav="notes",
    )


@app.api_route(methods=["GET", "HEAD"], path="/articles/name-resolution/")
def name_resolution(request: Request):
    return render_page(
        request,
        "name-resolution.html",
        title="Name resolution — Peakora Network",
        description="How DNS turns a hostname into an address, where the answer gets cached, and why a lookup can be invisible in a page load.",
        nav="notes",
        og_type="article",
    )


@app.api_route(methods=["GET", "HEAD"], path="/articles/connection-reuse/")
def connection_reuse(request: Request):
    return render_page(
        request,
        "connection-reuse.html",
        title="Connection reuse — Peakora Network",
        description="What a secure handshake establishes, why a fresh connection costs round trips, and how reusing connections changes what a browser can measure.",
        nav="notes",
        og_type="article",
    )


@app.api_route(methods=["GET", "HEAD"], path="/articles/reading-timings/")
def reading_timings(request: Request):
    return render_page(
        request,
        "reading-timings.html",
        title="Reading timings — Peakora Network",
        description="How Navigation Timing reports a page load, what the wait for the first byte includes, and why transfer time answers a different question.",
        nav="notes",
        og_type="article",
    )


@app.api_route(methods=["GET", "HEAD"], path="/robots.txt", include_in_schema=False)
def robots():
    return FileResponse(ASSETS / "robots.txt", media_type="text/plain")


@app.api_route(methods=["GET", "HEAD"], path="/favicon.svg", include_in_schema=False)
def favicon_svg():
    return FileResponse(ASSETS / "favicon.svg", media_type="image/svg+xml")


@app.api_route(methods=["GET", "HEAD"], path="/favicon.png", include_in_schema=False)
def favicon_png():
    return FileResponse(ASSETS / "favicon.png", media_type="image/png")


@app.api_route(methods=["GET", "HEAD"], path="/apple-touch-icon.png", include_in_schema=False)
def apple_touch_icon():
    return FileResponse(ASSETS / "apple-touch-icon.png", media_type="image/png")


@app.api_route(methods=["GET", "HEAD"], path="/healthz", include_in_schema=False)
def healthcheck():
    return {"status": "ok"}


@app.exception_handler(StarletteHTTPException)
def http_error(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        return render_page(
            request,
            "404.html",
            title="Not found — Peakora Network",
            description="The requested path is not available on this Peakora Network host.",
            status_code=404,
        )
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)
