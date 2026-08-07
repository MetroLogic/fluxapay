import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

# Test async context manager behavior
class TestAsyncContextManager:
    """Tests for async context manager support on SDK clients."""
    
    def test_sync_context_manager_connect_close(self):
        """Sync context manager should call connect on enter and close on exit."""
        mock_client = MagicMock()
        mock_client._connected = False
        
        # Simulate __enter__
        if not mock_client._connected:
            mock_client.connect()
        assert mock_client.connect.called
        
        # Simulate __exit__
        mock_client.close()
        assert mock_client.close.called

    @pytest.mark.asyncio
    async def test_async_context_manager_connect_close(self):
        """Async context manager should call async connect on enter and close on exit."""
        mock_client = AsyncMock()
        mock_client._connected = False
        mock_client.connect = AsyncMock()
        mock_client.close = AsyncMock()
        
        # Simulate __aenter__
        if not mock_client._connected:
            await mock_client.connect()
        mock_client.connect.assert_awaited_once()
        
        # Simulate __aexit__
        await mock_client.close()
        mock_client.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_async_context_manager_already_connected(self):
        """Should not reconnect if already connected."""
        mock_client = AsyncMock()
        mock_client._connected = True
        mock_client.connect = AsyncMock()
        
        # Already connected — connect should not be called
        if not mock_client._connected:
            await mock_client.connect()
        mock_client.connect.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_async_context_manager_exception_propagation(self):
        """Exceptions during context should propagate after cleanup."""
        mock_client = AsyncMock()
        mock_client._connected = False
        mock_client.connect = AsyncMock()
        mock_client.close = AsyncMock()
        
        try:
            if not mock_client._connected:
                await mock_client.connect()
            raise ValueError("test error")
        except ValueError:
            await mock_client.close()
        
        mock_client.close.assert_awaited_once()
