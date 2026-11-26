"""Shared pytest fixtures: a respx mock of the FluxaPay API (#1267)."""

import pytest
import respx

from fluxapay import AsyncFluxaPay, FluxaPay

from .fixtures import API_KEY, BASE_URL


@pytest.fixture
def mock_api():
    """A respx router for the API base URL that fails on unmocked calls."""
    with respx.mock(base_url=BASE_URL, assert_all_called=False, assert_all_mocked=True) as router:
        yield router


@pytest.fixture
def client():
    with FluxaPay(api_key=API_KEY, base_url=BASE_URL) as c:
        yield c


@pytest.fixture
async def async_client():
    async with AsyncFluxaPay(api_key=API_KEY, base_url=BASE_URL) as c:
        yield c
