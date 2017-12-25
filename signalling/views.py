"""OwnConf. Web views and websocket handlers."""

import aiohttp_jinja2
from aiohttp import web, WSMsgType
import json
import logging

from .rtc import Message


log = logging.getLogger(__name__)


@aiohttp_jinja2.template('index.html')
async def index(request):
    """Index page view."""
    return {}


async def websocket_handler(request):
    """Websocket handler."""
    room = request.app['room']

    ws = web.WebSocketResponse(heartbeat=3.0)
    await ws.prepare(request)

    # new client connected
    client_name = request.query.get('name', 'Unknown')
    client_id = await room.add_client(ws, client_name)

    async for msg in ws:
        if msg.type == WSMsgType.TEXT:
            if msg.data == 'close':
                await room.remove_client(client_id)
                await ws.close()
            else:
                log.info('Message from %s' % client_id)
                json_message = json.loads(msg.data)
                json_message['from'] = client_id
                message = Message.from_json(json_message)
                await room.transfer_message(message)
        elif msg.type == WSMsgType.ERROR:
            log.error(
                'ws connection closed with exception %s' % ws.exception()
            )
            await room.remove_client(client_id)
        else:
            log.warning('Unknown message type')

    await room.remove_client(client_id)
    log.info('Websocket connection closed')

    return ws
