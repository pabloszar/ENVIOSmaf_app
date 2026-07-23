#!/usr/bin/env python3
"""
Extrae el histórico de 'Envíos MAF Registro.xlsx' a JSON.

El Excel guarda TODO como texto: los montos son cadenas ("$2,600"), los
porcentajes también ("73.1%") y las fechas están mezcladas entre formato
M/D/YYYY y números de serie de Excel que quedaron corruptos.

Este script no adivina: cuando una fecha no es confiable la marca como
aproximada al mes que dice la columna MES, y lo reporta.

Uso:  python3 scripts/parse_excel.py <ruta.xlsx> <salida.json>
"""

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
EPOCA_EXCEL = date(1899, 12, 30)

MESES = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5, "JUNIO": 6,
    "JULIO": 7, "AGOSTO": 8, "SEPTIEMBRE": 9, "OCTUBRE": 10,
    "NOVIEMBRE": 11, "DICIEMBRE": 12,
}

# date.weekday(): lunes = 0
DIAS_SEMANA = {
    "Lunes": 0, "Martes": 1, "Miércoles": 2, "Miercoles": 2, "Jueves": 3,
    "Viernes": 4, "Sábado": 5, "Sabado": 5, "Domingo": 6,
}

# Columna del Excel -> nombre del campo
COLUMNAS = {
    "B": "orden_venta", "C": "num_ruta", "D": "mes", "E": "fecha", "F": "dia",
    "H": "cliente", "I": "calificacion", "J": "celular", "K": "destino",
    "L": "zona", "M": "num_pisos", "N": "carga", "O": "num_articulos",
    "P": "tamano_carga", "Q": "distancia_km", "R": "unidad", "S": "chofer",
    "T": "ingreso", "U": "cac", "V": "gasolina", "W": "num_chalanes",
    "X": "chalan", "Y": "caseta", "Z": "comida", "AA": "gasto_total",
    "AB": "utilidad", "AC": "margen_pct", "AI": "uso_cotizador",
    "AJ": "precio_sugerido", "AK": "tamano_cotizado",
}


def leer_shared_strings(z):
    cadenas = []
    raiz = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in raiz:
        cadenas.append("".join(t.text or "" for t in si.iter(NS + "t")))
    return cadenas


def letra_columna(ref):
    return re.match(r"([A-Z]+)", ref).group(1)


def limpiar(txt):
    """'' y '-' significan vacío en esta hoja."""
    if txt is None:
        return None
    t = txt.strip()
    return None if t in ("", "-", "#ERROR!", "#N/A", "#¡REF!") else t


def a_numero(txt):
    """'$2,600' -> 2600.0 ; '73.1%' -> 0.731 ; '1.0' -> 1.0"""
    t = limpiar(txt)
    if t is None:
        return None
    pct = t.endswith("%")
    t = t.replace("$", "").replace(",", "").replace("%", "").strip()
    try:
        n = float(t)
    except ValueError:
        return None
    return n / 100 if pct else n


def a_entero(txt):
    n = a_numero(txt)
    return int(n) if n is not None else None


def concuerda(f, mes_num, dia_txt):
    """Una fecha es creíble si respeta el mes y el día de la semana anotados."""
    if mes_num and f.month != mes_num:
        return False
    dia = (dia_txt or "").strip().capitalize()
    if dia in DIAS_SEMANA and DIAS_SEMANA[dia] != f.weekday():
        return False
    return True


def resolver_fecha(bruto, mes_txt, dia_txt, anio_default=2026):
    """
    Devuelve (fecha_iso, confiable, motivo).

    Parte del Excel se capturó bien como M/D/YYYY, y otra parte quedó como
    número de serie con el DÍA Y EL MES INTERCAMBIADOS. Ese segundo caso se
    detecta y se corrige: la fecha invertida se acepta solo si coincide a la
    vez con el mes escrito y con el día de la semana escrito, que es una
    verificación lo bastante estricta como para no estar inventando datos.
    """
    mes_num = MESES.get((mes_txt or "").strip().upper())
    bruto = limpiar(bruto)

    if bruto:
        m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", bruto)
        if m:
            mm, dd, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
            try:
                f = date(yy, mm, dd)
                if concuerda(f, mes_num, dia_txt):
                    return f.isoformat(), True, None
                return f.isoformat(), False, f"fecha {f} no concuerda con {mes_txt}/{dia_txt}"
            except ValueError:
                pass

        try:
            f = EPOCA_EXCEL + timedelta(days=int(float(bruto)))
        except ValueError:
            f = None

        if f:
            if concuerda(f, mes_num, dia_txt):
                return f.isoformat(), True, None
            # Intento con día y mes intercambiados.
            try:
                inv = date(f.year, f.day, f.month)
                if concuerda(inv, mes_num, dia_txt):
                    return inv.isoformat(), True, f"día/mes intercambiados en el Excel ({f} -> {inv})"
            except ValueError:
                pass
            if mes_num:
                return (
                    date(anio_default, mes_num, 1).isoformat(),
                    False,
                    f"serie {bruto} da {f}, irrecuperable; se usa el 1 de {mes_txt}",
                )

    if mes_num:
        return date(anio_default, mes_num, 1).isoformat(), False, "sin fecha, solo mes"
    return None, False, "sin fecha ni mes"


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    origen, destino = sys.argv[1], sys.argv[2]
    z = zipfile.ZipFile(origen)
    cadenas = leer_shared_strings(z)
    raiz = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    registros, avisos = [], []

    for fila in raiz.iter(NS + "row"):
        num_fila = int(fila.get("r"))
        if num_fila == 1:
            continue

        celdas = {}
        for c in fila:
            col = letra_columna(c.get("r"))
            if col not in COLUMNAS:
                continue
            v = c.find(NS + "v")
            if v is None or v.text is None:
                continue
            valor = cadenas[int(v.text)] if c.get("t") == "s" else v.text
            celdas[COLUMNAS[col]] = valor

        # Una fila sirve si tiene destino o ingreso; lo demás es relleno.
        destino_txt = limpiar(celdas.get("destino"))
        ingreso = a_numero(celdas.get("ingreso"))
        if not destino_txt and ingreso is None:
            continue

        fecha, confiable, motivo = resolver_fecha(
            celdas.get("fecha"), celdas.get("mes"), celdas.get("dia")
        )
        if motivo:
            avisos.append({
                "fila": num_fila,
                "destino": destino_txt,
                "confiable": confiable,
                "motivo": motivo,
            })

        registros.append({
            "fila_excel": num_fila,
            "orden_venta": limpiar(celdas.get("orden_venta")),
            "num_ruta": a_entero(celdas.get("num_ruta")),
            "fecha": fecha,
            "fecha_confiable": confiable,
            "mes_texto": limpiar(celdas.get("mes")),
            "cliente": limpiar(celdas.get("cliente")),
            "celular": limpiar(celdas.get("celular")),
            "calificacion": a_entero(celdas.get("calificacion")),
            "destino": destino_txt,
            "zona": limpiar(celdas.get("zona")),
            "num_pisos": a_entero(celdas.get("num_pisos")),
            "num_articulos": a_entero(celdas.get("num_articulos")),
            "tamano_carga": limpiar(celdas.get("tamano_carga")),
            "distancia_km": a_numero(celdas.get("distancia_km")),
            "unidad": limpiar(celdas.get("unidad")),
            "chofer": limpiar(celdas.get("chofer")),
            "ingreso": ingreso,
            "gasolina": a_numero(celdas.get("gasolina")),
            "num_chalanes": a_entero(celdas.get("num_chalanes")),
            "pago_chalan": a_numero(celdas.get("chalan")),
            "caseta": a_numero(celdas.get("caseta")),
            "comida": a_numero(celdas.get("comida")),
            "gasto_total_excel": a_numero(celdas.get("gasto_total")),
            "utilidad_excel": a_numero(celdas.get("utilidad")),
            "margen_excel": a_numero(celdas.get("margen_pct")),
            "uso_cotizador": a_numero(celdas.get("uso_cotizador")) == 1,
            "precio_sugerido": a_numero(celdas.get("precio_sugerido")),
        })

    salida = {"registros": registros, "avisos": avisos}
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)

    # ── Resumen ──
    fechas_malas = sum(1 for r in registros if not r["fecha_confiable"])
    con_ingreso = sum(1 for r in registros if r["ingreso"])
    choferes = {r["chofer"] for r in registros if r["chofer"]}
    unidades = {r["unidad"] for r in registros if r["unidad"]}
    destinos = {r["destino"] for r in registros if r["destino"]}
    rutas_mult = {}
    for r in registros:
        if r["num_ruta"]:
            rutas_mult.setdefault(r["num_ruta"], []).append(r)
    agrupadas = {k: v for k, v in rutas_mult.items() if len(v) > 1}

    print(f"Registros extraídos     : {len(registros)}")
    print(f"  con ingreso capturado : {con_ingreso}")
    print(f"  con fecha aproximada  : {fechas_malas}")
    print(f"Choferes distintos      : {len(choferes)} -> {sorted(choferes)}")
    print(f"Unidades distintas      : {len(unidades)} -> {sorted(unidades)}")
    print(f"Destinos distintos      : {len(destinos)}")
    print(f"Núm. de ruta repetidos  : {len(agrupadas)} (posibles rutas multi-parada)")
    total_ing = sum(r["ingreso"] or 0 for r in registros)
    total_gas = sum(r["gasto_total_excel"] or 0 for r in registros)
    print(f"Ingreso total histórico : ${total_ing:,.0f}")
    print(f"Gasto total histórico   : ${total_gas:,.0f}")
    print(f"\nJSON escrito en {destino}")


if __name__ == "__main__":
    main()
