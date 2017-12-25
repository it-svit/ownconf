"""OwnConf RTC protocol."""

from uuid import uuid4
import logging

log = logging.getLogger(__name__)


class Message:
    """RTC protocal message."""

    __slots__ = ['mtype', 'data', 'cfrom', 'cto', 'ice_type']

    def __init__(self, mtype, data, cfrom=None, cto=None, ice_type=None):
        """Init message."""
        self.mtype = mtype
        self.data = data
        self.cfrom = cfrom
        self.cto = cto
        self.ice_type = ice_type

    @classmethod
    def from_json(cls, json_message):
        """Load from JSON."""
        return cls(mtype=json_message['type'],
                   data=json_message['data'],
                   cfrom=json_message.get('from') or None,
                   cto=json_message.get('to') or None,
                   ice_type=json_message.get('ice_type') or None,
                   )

    def to_json(self):
        """Convert to JSON."""
        json_message = {'type': self.mtype,
                        'data': self.data,
                        'from': self.cfrom,
                        'to': self.cto,
                        'ice_type': self.ice_type,
                        }
        return json_message

    def __repr__(self):
        """Message representation."""
        return 'Message(mtype={mtype}, data={data}, ' \
               'cfrom={cfrom}, cto={cto}, ice_type={ice_type}' \
               ')'.format(mtype=self.mtype,
                          data=self.data,
                          cfrom=self.cfrom,
                          cto=self.cto,
                          ice_type=self.ice_type,
                          )


class Room:
    """WebRTC room."""

    def __init__(self):
        """Init room."""
        self.clients = {}
        log.info('Init room')

    async def add_client(self, ws, client_name=None):
        """Add client to the room."""
        new_client_id = uuid4().hex
        log.info('Add new client - %s' % new_client_id)
        client_data = {'ws': ws,
                       'name': client_name,
                       }
        self.clients[new_client_id] = client_data

        await self.send_room_messages()
        return new_client_id

    async def remove_client(self, client_id):
        """Remove client from the room."""
        log.info('Remove client - %s' % client_id)
        del self.clients[client_id]
        await self.send_room_messages()

    @property
    def clients_count(self):
        """Return clients count."""
        return len(self.clients)

    async def send_room_messages(self):
        """Send room messages."""
        for client_id, client_data in self.clients.items():
            ws = client_data['ws']
            other_clients = {_cid: {'name': _cdata['name']}
                             for _cid, _cdata in self.clients.items()
                             if _cid != client_id}
            message = Message('room', other_clients, cto=client_id)
            log.debug('Send room message - %s' % message)
            await ws.send_json(message.to_json())

    async def _send_chat_messages(self, message):
        """Broadcast chat messages."""
        from_client = self.clients.get(message.cfrom, None)
        if from_client is not None:
            from_name = from_client['name']
            for client_id, client_data in self.clients.items():
                ws = client_data['ws']
                message.data.update({'name': from_name})
                log.debug('Send chat message - %s' % message)
                await ws.send_json(message.to_json())

    async def _send_webrtc_message(self, message):
        """Transfer WebRTC message."""
        log.debug('Handle WebRTC message - %s' % message)
        client_data = self.clients.get(message.cto, None)

        if client_data is not None:
            to_ws = client_data['ws']
            await to_ws.send_json(message.to_json())
            log.debug('Transfer WebRTC message %s' % message)
        else:
            log.error('Invalid client_id')

    async def transfer_message(self, message):
        """Transfer any message."""
        log.debug('Handle message - %s' % message)

        if message.mtype in ('offer', 'answer', 'ice'):
            # pass the offer, answer or ice
            await self._send_webrtc_message(message)

        elif message.mtype == 'chat':
            # broadcast chat message
            await self._send_chat_messages(message)

        else:
            log.error('Invalid message type')
