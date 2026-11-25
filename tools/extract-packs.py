#!/usr/bin/env python3
"""
Regenerate src/gecko/packs.json from the pack definitions of geckolib.

The in.touch2 module exposes the memory of the spa controller as a "status
block"; where each value lives depends on the controller platform (inYT,
inXE...) and on the config/log versions it reports. geckolib (GPL-3.0) ships
those maps, generated from the Gecko XML definitions. This script reads them
STATICALLY (Python AST, the downloaded code is never executed), keeps only the
entries the integration uses and writes them as compact JSON.

Usage:
  pip download --no-deps --no-binary :all: geckolib
  tar xzf geckolib-*.tar.gz
  python3 -I tools/extract-packs.py geckolib-<version>/src/geckolib/driver/packs \
    > src/gecko/packs.json
"""

import ast
import json
import pathlib
import re
import sys

KEYS = {
    "TempUnits", "SetpointG", "RealSetPointG", "DisplayedTempG", "RhWaterTemp",
    "MinSetpointG", "MaxSetpointG", "Heating", "CoolingDown", "TempNotValid",
    "UdP1", "UdP2", "UdP3", "UdP4", "UdP5", "UdBL", "UdLi", "UdL120", "UdWaterfall",
    "UdVSP1", "UdVSP3", "Pump1AsVSP", "Pump3AsVSP",
    "P1", "P2", "P3", "P4", "P5", "BL", "CP", "O3", "LI", "L120", "Waterfall",
    "PackType", "EconActive", "QuietState", "Clean", "Purge", "SwmActive",
}
SKIP = re.compile(r"^(mrsteam|mas-ibc|inmix|inclear|interface|ink600|intouch2-co|mia)")

# Positional arguments of each accessor class, after `self.struct, path`.
SIGNATURES = {
    "GeckoByteStructAccessor": ("Byte", ["pos", "rw"]),
    "GeckoWordStructAccessor": ("Word", ["pos", "rw"]),
    "GeckoTimeStructAccessor": ("Time", ["pos", "rw"]),
    "GeckoTempStructAccessor": ("Temp", ["pos", "rw"]),
    "GeckoBoolStructAccessor": ("Bool", ["pos", "bitpos", "rw"]),
    "GeckoEnumStructAccessor": ("Enum", ["pos", "bitpos", "items", "size", "maxitems", "rw"]),
}


def literal(node):
    return ast.literal_eval(node)


def property_return(tree, name):
    """Value returned by the `name` property of the module's class."""
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            for stmt in ast.walk(node):
                if isinstance(stmt, ast.Return) and stmt.value is not None:
                    return stmt.value
    return None


def accessors_of(tree):
    returned = property_return(tree, "accessors")
    result = {}
    if not isinstance(returned, ast.Dict):
        return result
    for key_node, call in zip(returned.keys, returned.values):
        if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Name):
            continue
        signature = SIGNATURES.get(call.func.id)
        if signature is None:
            continue
        kind, names = signature
        values = dict(zip(names, (literal(arg) for arg in call.args[2:])))
        items = values.get("items")
        if isinstance(items, str):
            items = items.split("|")
        result[literal(key_node)] = [
            values["pos"],
            kind,
            values.get("bitpos"),
            items,
            values.get("size"),
            values.get("maxitems"),
            values.get("rw"),
        ]
    return result


def main():
    folder = pathlib.Path(sys.argv[1])
    result = {}
    for path in sorted(folder.glob("*.py")):
        name = path.stem
        if name == "__init__" or SKIP.match(name):
            continue
        tree = ast.parse(path.read_text(encoding="utf8"))
        match = re.match(r"^(.*)-(cfg|log)-(\d+)$", name)
        if not match:
            plateform_type = property_return(tree, "plateform_type")
            if plateform_type is not None:
                result.setdefault(name, {"cfg": {}, "log": {}})["type"] = literal(plateform_type)
            continue
        platform, kind, version = match.groups()
        outputs = property_return(tree, "output_keys")
        outputs = literal(outputs) if outputs is not None else []
        accessors = accessors_of(tree)
        keep = {k: v for k, v in accessors.items() if k in KEYS or k in outputs}
        result.setdefault(platform, {"cfg": {}, "log": {}})[kind][version] = {
            "outputs": outputs,
            "accessors": keep,
        }
    json.dump(result, sys.stdout, separators=(",", ":"), sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
