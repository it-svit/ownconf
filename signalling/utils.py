"""OwnConf validators."""

import trafaret


TRAFARET = trafaret.Dict({
    trafaret.Key('host'): trafaret.IP,
    trafaret.Key('port'): trafaret.Int(),
})
