"""OwnConf routes."""

from aiohttp import hdrs
import pathlib

from .views import index, websocket_handler


PROJECT_ROOT = pathlib.Path(__file__).parent


def setup_routes(app):
    """Setup routes."""
    app.router.add_get('/', index)
    app.router.add_route(hdrs.METH_GET, '/ws', websocket_handler)
    app.router.add_static('/static/',
                          path=str(PROJECT_ROOT / 'static'),
                          name='static')
