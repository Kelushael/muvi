import os
import pytest
import requests


@pytest.fixture(scope="session")
def base_url():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        # fallback for local container
        url = "http://localhost:8001"
    return url.rstrip("/")


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    return s
