#!/usr/bin/env python3
"""
load_all_raw.py — Загальний диспетчер: бере JSON-файл(и) з raw/lsmd і сам
визначає, яким обробником і в яку(і) таблицю(ї) їх заливати.

Правила визначення обробника (по імені файлу):
  raw_bundle*.json        -> load_resources_raw (lpz_raw_resources + 2 довідники)
  ec_severity_merge.json  -> пропускається (уже домерджено в lpz_hospitalizations
                              напряму, це не окрема сутність — див. handoff)
  усе інше *.json         -> load_json_raw (generic, 1 файл = 1 lpz_raw_<тип> таблиця)

Запускати:
  python3 scripts/load_all_raw.py <файл1.json> [файл2.json ...] --org-edrpou 43342788
  python3 scripts/load_all_raw.py --dir ~/Documents/LSMD/raw/lsmd --org-edrpou 43342788
  python3 scripts/load_all_raw.py --dir ~/Documents/LSMD/raw/lsmd --org-edrpou 43342788 --dry-run
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from load_json_raw import load_generic
from load_resources_raw import load_resources

SKIP_FILES = {"ec_severity_merge.json"}


def classify(src: Path) -> str:
    if src.name in SKIP_FILES:
        return "skip"
    if src.name.startswith("raw_bundle"):
        return "resources"
    return "generic"


def main():
    parser = argparse.ArgumentParser(description="Заливає кілька/усі JSON-файли у відповідні lpz_raw_* таблиці одним запуском.")
    parser.add_argument("json_paths", nargs="*", help="Конкретні файли (якщо не вказано --dir)")
    parser.add_argument("--dir", help="Обробити всі *.json у цій директорії")
    parser.add_argument("--org-edrpou", help="ЄДРПОУ, якщо його нема в meta файлів")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, help="Взяти лише перші N записів з кожного файлу (тестовий прогін)")
    args = parser.parse_args()

    if args.dir:
        files = sorted(Path(args.dir).expanduser().glob("*.json"))
    else:
        files = [Path(p).expanduser() for p in args.json_paths]

    if not files:
        print("Не вказано жодного файлу (--dir або перелік файлів)", file=sys.stderr)
        sys.exit(1)

    results = []
    for src in files:
        kind = classify(src)
        print(f"\n{'='*60}\n{src.name}  [{kind}]\n{'='*60}")

        if kind == "skip":
            print("Пропущено: дані з цього файлу вже домерджені напряму в lpz_hospitalizations, окремої таблиці не потребує.")
            results.append((src.name, "skip"))
            continue

        if kind == "resources":
            org = args.org_edrpou
            if not org:
                print(f"[{src.name}] Потрібен --org-edrpou (нема в meta файлу)", file=sys.stderr)
                results.append((src.name, "FAIL: нема org_edrpou"))
                continue
            ok = load_resources(src, org, dry_run=args.dry_run, limit=args.limit)
        else:
            ok = load_generic(src, org_edrpou=args.org_edrpou, dry_run=args.dry_run, limit=args.limit)

        results.append((src.name, "OK" if ok else "FAIL"))

    print(f"\n{'='*60}\nПідсумок:")
    for name, status in results:
        print(f"  {status:6s} {name}")


if __name__ == "__main__":
    main()
