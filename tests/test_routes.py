from html.parser import HTMLParser
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app, base_url="https://sulfur.peakora.cc", follow_redirects=False)

PAGES = {
    "/": "Peakora Network — Edge infrastructure",
    "/network/": "Network — Peakora Network",
    "/articles/": "Field notes — Peakora Network",
    "/articles/name-resolution/": "Name resolution — Peakora Network",
    "/articles/connection-reuse/": "Connection reuse — Peakora Network",
    "/articles/reading-timings/": "Reading timings — Peakora Network",
}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.hrefs.append(href)


@pytest.mark.parametrize(("path", "title"), PAGES.items())
def test_html_routes_render_complete_pages(path, title):
    response = client.get(path)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert f"<title>{title}</title>" in response.text
    assert '<meta name="robots" content="noindex, nofollow" />' in response.text
    assert "abuse@peakora.network" in response.text
    assert "{{" not in response.text
    assert "{%" not in response.text


@pytest.mark.parametrize("path", ["/network", "/articles", "/articles/name-resolution"])
def test_trailing_slash_redirects_keep_https(path):
    response = client.get(path)

    assert response.status_code == 307
    assert response.headers["location"] == f"https://sulfur.peakora.cc{path}/"


def test_head_is_available_for_html_routes():
    response = client.head("/network/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.content == b""


@pytest.mark.parametrize("path", ["/does-not-exist/", "/docs", "/redoc", "/openapi.json"])
def test_unknown_routes_render_the_site_404(path):
    response = client.get(path)

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("text/html")
    assert "Nothing at this path." in response.text
    assert 'href="/network/"' in response.text


def test_healthcheck_is_minimal():
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_write_methods_are_not_accepted_on_pages():
    response = client.post("/")

    assert response.status_code == 405


@pytest.mark.parametrize(
    ("path", "content_type"),
    [
        ("/assets/styles.css", "text/css"),
        ("/assets/app.js", "javascript"),
        ("/assets/lib.js", "javascript"),
        ("/assets/fonts/inter-latin.woff2", "font/woff2"),
        ("/robots.txt", "text/plain"),
        ("/favicon.svg", "image/svg+xml"),
        ("/favicon.png", "image/png"),
        ("/apple-touch-icon.png", "image/png"),
    ],
)
def test_static_routes(path, content_type):
    response = client.get(path)

    assert response.status_code == 200
    assert content_type in response.headers["content-type"]
    assert response.content


@pytest.mark.parametrize("path", ["/assets/missing.css", "/src/site.json", "/app/main.py"])
def test_private_and_missing_files_are_not_served(path):
    assert client.get(path).status_code == 404


def test_every_internal_link_targets_a_registered_route():
    registered = set(PAGES) | {
        "/robots.txt",
        "/favicon.svg",
        "/favicon.png",
        "/apple-touch-icon.png",
    }

    for path in PAGES:
        parser = Links()
        parser.feed(client.get(path).text)
        for href in parser.hrefs:
            parsed = urlsplit(href)
            if parsed.scheme or not parsed.path:
                continue
            assert parsed.path in registered, f"{path}: broken link {href}"


def test_xray_paths_have_no_fastapi_handlers():
    paths = {route.path for route in app.routes}

    assert "/api/v1/network/connection-lifecycle/" not in paths
    assert "/api/v1/network/edge-routing/" not in paths
