#!/usr/bin/env python3
"""
load_resources_raw.py — Заливає raw_bundle.json (resources = медперсонал) у lpz-схему,
З ПРАВИЛЬНИМ розподілом, а не тупим розгортанням масивів по індексу.

Чому не через load_json_raw.py: поле specialityWithServiceDescription[].searchTagsSpeciality
і .serviceDescription — це НЕ дані конкретного лікаря, а спільний довідник послуг/тегів
пошуку для всієї спеціальності (перевірено: у різних лікарів з однаковою спеціальністю —
побайтово однакові списки, однакові createdAt 2016 року). Розгортання по індексу дало б
938 здебільшого порожніх колонок і задублювало б довідник по кожному з 738 лікарів.

Замість цього три таблиці:
  lpz_raw_resources                 — по рядку на лікаря/ресурс (компактно)
  lpz_dict_speciality_search_tags   — унікальні (speciality_id, тег) — довідник
  lpz_dict_speciality_services      — унікальні (speciality_id, послуга) — довідник

Запускати:
  python3 scripts/load_resources_raw.py <шлях-до-raw_bundle.json> --org-edrpou 43342788
"""

import argparse
import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
    "Content-Profile": "lpz",
}
BATCH_SIZE = 200


def g(d, path, default=None):
    cur = d
    for key in path.split("."):
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
        if cur is None:
            return default
    return cur


def build_resource_row(r, org_edrpou, source_file, extracted_at):
    swsd = (r.get("specialityWithServiceDescription") or [{}])[0]
    return {
        "org_edrpou": org_edrpou,
        "source_file": source_file,
        "extracted_at": extracted_at,
        "resource_id": r.get("resourceId"),
        "resource_type": r.get("resourceType"),
        "first_name": r.get("firstName"),
        "last_name": r.get("lastName"),
        "middle_name": r.get("middleName"),
        "birth_date": r.get("birthDate"),
        "sex": r.get("sex"),
        "phone": r.get("phone"),
        "email": r.get("email"),
        "position_id": g(r, "position.positionId"),
        "position_name": g(r, "position.name"),
        "qualification_name": g(r, "qualification.name"),
        "division_structure_id": g(r, "division.structureId"),
        "division_name": g(r, "division.name"),
        "organization_structure_id": g(r, "organization.structureId"),
        "organization_name": g(r, "organization.name"),
        "speciality_id": swsd.get("specialityId"),
        "speciality_name": swsd.get("name"),
        "doctor_speciality": swsd.get("doctorSpeciality"),
        "available": r.get("available"),
        "rating_average": g(r, "rating.average"),
        "rating_review_count": g(r, "rating.reviewCount"),
        "ehealth_sync_status": g(r, "ehealthSync.status"),
        "ehealth_sync_is_associated": g(r, "ehealthSync.isAssociated"),
    }


def build_dicts(resources):
    tags = {}
    services = {}
    for r in resources:
        swsd = (r.get("specialityWithServiceDescription") or [{}])[0]
        spec_id = swsd.get("specialityId")
        if not spec_id:
            continue
        for t in swsd.get("searchTagsSpeciality") or []:
            key = (spec_id, t.get("searchTagsSpecialityId"))
            tags[key] = {
                "speciality_id": spec_id,
                "search_tags_speciality_id": t.get("searchTagsSpecialityId"),
                "name": t.get("name"),
            }
        for s in swsd.get("serviceDescription") or []:
            key = (spec_id, s.get("serviceDescriptionId"))
            services[key] = {
                "speciality_id": spec_id,
                "service_description_id": str(s.get("serviceDescriptionId")),
                "name": s.get("name"),
                "description": s.get("description"),
                "is_active": s.get("isActive"),
                "is_program": s.get("isProgram"),
            }
    return list(tags.values()), list(services.values())


def post_batches(table, rows, upsert=False):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = HEADERS
    if upsert:
        headers = {**HEADERS, "Prefer": f"{HEADERS['Prefer']},resolution=merge-duplicates"}
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        r = requests.post(url, headers=headers, json=batch)
        if not r.ok:
            print(f"Помилка {table} на batch {i}: {r.status_code} {r.text[:500]}", file=sys.stderr)
            r.raise_for_status()
    print(f"  {table}: {len(rows)} рядків")


def load_resources(src: Path, org_edrpou, dry_run=False, limit=None) -> bool:
    with open(src, "r", encoding="utf-8") as f:
        data = json.load(f)
    resources = data.get("resources") or []
    if limit:
        resources = resources[:limit]
    extracted_at = g(data, "meta.extractedAt")
    print(f"Ресурсів у файлі: {len(resources)}" + (f" (LIMIT {limit})" if limit else ""))

    resource_rows = [build_resource_row(r, org_edrpou, src.name, extracted_at) for r in resources]
    tag_rows, service_rows = build_dicts(resources)

    print(f"lpz_raw_resources: {len(resource_rows)} рядків")
    print(f"lpz_dict_speciality_search_tags: {len(tag_rows)} унікальних (speciality_id, тег)")
    print(f"lpz_dict_speciality_services: {len(service_rows)} унікальних (speciality_id, послуга)")

    if dry_run:
        print("\n--dry-run: дані не записувались.")
        return True

    del_headers = {**HEADERS, "Content-Profile": "lpz"}
    requests.delete(
        f"{SUPABASE_URL}/rest/v1/lpz_raw_resources",
        headers=del_headers,
        params={"org_edrpou": f"eq.{org_edrpou}", "source_file": f"eq.{src.name}"},
    ).raise_for_status()

    post_batches("lpz_raw_resources", resource_rows)
    post_batches("lpz_dict_speciality_search_tags", tag_rows, upsert=True)
    post_batches("lpz_dict_speciality_services", service_rows, upsert=True)
    print("\nГотово.")
    return True


def main():
    parser = argparse.ArgumentParser(description="Заливає resources з raw_bundle.json у lpz_raw_resources + довідники по спеціальності.")
    parser.add_argument("json_path")
    parser.add_argument("--org-edrpou", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, help="Взяти лише перші N ресурсів (тестовий прогін)")
    args = parser.parse_args()

    src = Path(args.json_path).expanduser()
    ok = load_resources(src, args.org_edrpou, dry_run=args.dry_run, limit=args.limit)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
