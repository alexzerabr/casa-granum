"""Acesso somente-leitura ao Firebird 3.0 (Nutify PDV) com WireCrypt."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from firebird.driver import Connection, connect, driver_config

from app.config import settings

_DB_ALIAS = "nutify_pdv"
_configured = False


def _configure() -> None:
    global _configured
    if _configured:
        return

    srv = driver_config.register_server(_DB_ALIAS)
    srv.host.value = settings.fb_host
    srv.port.value = settings.fb_port

    db = driver_config.register_database(_DB_ALIAS)
    db.server.value = _DB_ALIAS
    db.database.value = settings.fb_database
    db.user.value = settings.fb_user
    db.password.value = settings.fb_password
    db.charset.value = settings.fb_charset

    _configured = True


@contextmanager
def firebird_connection() -> Iterator[Connection]:
    _configure()
    con = connect(_DB_ALIAS)
    try:
        yield con
    finally:
        con.close()


def decode_blob(value) -> str | None:
    """Normaliza PRO_BCO (BLOB sub-type 1, ISO8859-1) para str UTF-8."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if hasattr(value, "read"):
        value = value.read()
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("iso-8859-1", errors="replace")
    return str(value)


def ping() -> tuple[str, str]:
    """Sanity check — retorna versão da engine e endereço remoto."""
    with firebird_connection() as con:
        cur = con.cursor()
        cur.execute("SELECT rdb$get_context('SYSTEM','ENGINE_VERSION') FROM rdb$database")
        engine = cur.fetchone()[0]
        cur.execute(
            "SELECT MON$REMOTE_ADDRESS FROM MON$ATTACHMENTS "
            "WHERE MON$ATTACHMENT_ID = CURRENT_CONNECTION"
        )
        remote = cur.fetchone()[0]
    return engine, remote
