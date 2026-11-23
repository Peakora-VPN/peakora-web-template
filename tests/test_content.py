from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from test_routes import PAGES


ROOT = Path(__file__).resolve().parent.parent
client = TestClient(app, base_url="https://sulfur.peakora.cc")


@pytest.mark.parametrize(
    ("path", "og_type", "nav"),
    [
        ("/", "website", "overview"),
        ("/network/", "website", "network"),
        ("/articles/", "website", "notes"),
        ("/articles/name-resolution/", "article", "notes"),
        ("/articles/connection-reuse/", "article", "notes"),
        ("/articles/reading-timings/", "article", "notes"),
    ],
)
def test_open_graph_and_active_navigation(path, og_type, nav):
    html = client.get(path).text

    assert f'<meta property="og:type" content="{og_type}" />' in html
    assert f'data-nav="{nav}" aria-current="page"' in html
    assert html.count('aria-current="page"') == 1


def test_not_found_has_no_active_navigation():
    response = client.get("/missing")

    assert response.status_code == 404
    assert 'aria-current="page"' not in response.text


def test_no_external_requests_or_forbidden_terms_in_public_content():
    namespaces = ("http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink")
    forbidden = ("vpn", "proxy", "xray", "reality", "remnawave", "marzban", "shadowsocks", "vless", "trojan")
    sources = [
        *(client.get(path).text for path in PAGES),
        *((ROOT / "src" / "assets" / name).read_text(encoding="utf-8") for name in ("styles.css", "app.js", "lib.js", "logo.svg")),
    ]

    for text in sources:
        for namespace in namespaces:
            text = text.replace(namespace, "")
        lowered = text.lower()
        assert "http://" not in lowered
        assert "https://" not in lowered
        assert 'src="//' not in lowered
        assert 'href="//' not in lowered
        assert 'url(//' not in lowered
        for word in forbidden:
            assert word not in lowered


def test_browser_javascript_has_no_tracking_or_storage():
    for name in ("app.js", "lib.js"):
        source = (ROOT / "src" / "assets" / name).read_text(encoding="utf-8").lower()
        for api in ("localstorage", "sessionstorage", "document.cookie", "indexeddb", "sendbeacon", "xmlhttprequest", "navigator.connection"):
            assert api not in source
        assert "fetch(" not in source


def test_robots_policy_matches_page_metadata():
    response = client.get("/robots.txt")

    assert response.status_code == 200
    assert "User-agent: *" in response.text
    assert "Disallow: /" in response.text
