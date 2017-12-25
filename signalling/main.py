"""OwnConf RTC main."""

import argparse
import asyncio
import logging
import sys
import ssl

import jinja2

import aiohttp_jinja2
from aiohttp import web
from signalling.middlewares import setup_middlewares
from signalling.routes import setup_routes
from signalling.utils import TRAFARET
from trafaret_config import commandline
from .rtc import Room


def init(loop, argv):
    """Init application."""
    ap = argparse.ArgumentParser()
    commandline.standard_argparse_options(
        ap,
        default_config='./config/signalling.yaml'
    )

    options = ap.parse_args(argv)

    config = commandline.config_from_options(options, TRAFARET)

    # setup application and extensions
    app = web.Application(loop=loop)

    # load config from yaml file in current dir
    app['config'] = config

    room = Room()
    app['room'] = room

    # setup Jinja2 template renderer
    aiohttp_jinja2.setup(
        app,
        loader=jinja2.PackageLoader('signalling', 'templates')
    )

    # setup views and routes
    setup_routes(app)
    setup_middlewares(app)

    return app


def main(argv):
    """Entry point."""
    logging.basicConfig(level=logging.DEBUG)  # init logging

    loop = asyncio.get_event_loop()
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_SSLv23)
    ssl_context.load_cert_chain('signalling/certificate.crt',
                                'signalling/certificate.key')

    app = init(loop, argv)
    web.run_app(app,
                host=app['config']['host'],
                port=app['config']['port'],
                ssl_context=ssl_context)


if __name__ == '__main__':
    main(sys.argv[1:])
