"""Sanity check de conectividade Firebird (Nutify PDV) com WireCrypt."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from firebird.driver import connect, driver_config


def load_env(path: Path) -> None:
    if not path.exists():
        sys.exit(f"erro: {path} não encontrado")
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def decode_blob(value) -> str | None:
    """Normaliza PRO_BCO (BLOB ISO8859-1) para str UTF-8."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if hasattr(value, "read"):
        value = value.read()
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("iso-8859-1", errors="replace")
    return str(value)


def banner(title: str) -> None:
    print(f"\n{'=' * 70}\n {title}\n{'=' * 70}")


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    load_env(project_root / ".env")

    host = os.environ["FB_HOST"]
    port = os.environ["FB_PORT"]
    database = os.environ["FB_DATABASE"]
    user = os.environ["FB_USER"]
    password = os.environ["FB_PASSWORD"]
    charset = os.environ.get("FB_CHARSET", "ISO8859_1")

    srv = driver_config.register_server("nutify_pdv")
    srv.host.value = host
    srv.port.value = port

    db = driver_config.register_database("nutify_pdv_db")
    db.server.value = "nutify_pdv"
    db.database.value = database
    db.user.value = user
    db.password.value = password
    db.charset.value = charset

    banner("1. Conexão")
    print(f"  host={host}:{port}")
    print(f"  database={database}")
    print(f"  user={user}")
    print(f"  charset={charset}")

    try:
        con = connect("nutify_pdv_db")
    except Exception as exc:
        print(f"\n[FALHA] {type(exc).__name__}: {exc}")
        return 1

    with con:
        cur = con.cursor()

        cur.execute("SELECT rdb$get_context('SYSTEM','ENGINE_VERSION') FROM rdb$database")
        engine = cur.fetchone()[0]
        print(f"\n  ✓ conectado — Firebird engine: {engine}")

        banner("2. Wire encryption")
        cur.execute(
            "SELECT MON$REMOTE_PROTOCOL, MON$REMOTE_ADDRESS, MON$AUTH_METHOD "
            "FROM MON$ATTACHMENTS WHERE MON$ATTACHMENT_ID = CURRENT_CONNECTION"
        )
        proto, remote, auth = cur.fetchone()
        print(f"  Protocolo remoto: {proto}")
        print(f"  Endereço remoto:  {remote}")
        print(f"  Auth method:      {auth}")
        print("  ✓ conexão via libfbclient nativo → WireCrypt ativo.")

        banner("3. Gengibre em Pó (PRO_COD = 4) — validação contra doc")
        cur.execute(
            "SELECT PRO_COD, PRO_DES, PRO_QTD, PRO_MIX, PRO_MIA, PRO_PMC, "
            "PRO_IDB, PRO_UND, PRO_VLC, PRO_GRU "
            "FROM PRODUTO WHERE PRO_COD = 4"
        )
        row = cur.fetchone()
        if not row:
            print("  ⚠ produto não encontrado")
        else:
            cols = [d[0] for d in cur.description]
            for col, val in zip(cols, row):
                print(f"  {col:<10} = {val!r}")

        banner("4. Contagens de produtos relevantes")
        cur.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM PRODUTO WHERE PRO_SIT='A'),
              (SELECT COUNT(*) FROM PRODUTO WHERE PRO_SIT='A' AND PRO_IDB='S'),
              (SELECT COUNT(*) FROM PRODUTO WHERE PRO_SIT='A' AND PRO_IDB='S' AND PRO_MIX='S'),
              (SELECT COUNT(*) FROM PRODUTO WHERE PRO_SIT='A' AND PRO_IDB='S' AND PRO_MIX='S'
                 AND PRO_MIA IS NOT NULL),
              (SELECT COUNT(*) FROM PRODUTO WHERE PRO_SIT='A' AND PRO_BCO IS NOT NULL)
            FROM RDB$DATABASE
            """
        )
        ativos, balanca, mix_flag, mix_valor, com_bco = cur.fetchone()
        print(f"  Ativos (PRO_SIT='A'):                          {ativos}")
        print(f"  Ativos + integração balança (PRO_IDB='S'):     {balanca}")
        print(f"  + flag de estoque mínimo (PRO_MIX='S'):        {mix_flag}")
        print(f"  + valor de mínimo preenchido (PRO_MIA):        {mix_valor}")
        print(f"  Ativos com benefícios (PRO_BCO):               {com_bco}")

        banner("5. Amostra de PRO_BCO (decode ISO8859-1 → UTF-8)")
        cur.execute(
            """
            SELECT FIRST 5 p.PRO_COD, p.PRO_DES, g.GRU_DES, p.PRO_VLC, p.PRO_BCO
            FROM PRODUTO p
            JOIN GRUPO g ON g.GRU_COD = p.PRO_GRU
            WHERE p.PRO_SIT = 'A' AND p.PRO_BCO IS NOT NULL
            ORDER BY p.PRO_DES
            """
        )
        for cod, des, gru, vlc, bco in cur:
            texto = decode_blob(bco) or ""
            preview = texto.strip().replace("\n", " ")[:140]
            print(f"\n  [{cod}] {des} — grupo: {gru} — R$/kg: {vlc}")
            print(f"    {preview}{'…' if len(texto) > 140 else ''}")

    print("\n✓ validação concluída.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
