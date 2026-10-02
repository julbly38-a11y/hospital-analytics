#!/usr/bin/env python3
"""
Універсальний нормалізатор helsi raw-бандла -> канонічна медична інформаційна модель.

Принцип: helsi = джерело істини. Канон спеціальностей/посад = довідники helsi
(canon/*.json), ключ = helsi specialityId / positionId. Мапінг empl
робиться ПО ID (не по назві) → 0 синонімів, автоматично універсальний для будь-якої
укр. лікарні (той самий specialityId скрізь). Єдина власна надбудова — групування
відділень у клінічні напрямки (direction/block), бо цього в helsi немає.

Вхід: сирий бандл з helsi_extract.js. Вихід: { organization, departments[], empl[], _report }.
Мапінг відділень підбирається автоматично по rootStructureId (mappings/).

Використання:
    python3 scripts/helsi_normalize.py raw/<лікарня>/raw_bundle.json
    python3 scripts/helsi_normalize.py <raw.json> --mapping <file> --out <file>
"""
import sys, os, json, glob

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "canon")

# ── канонічні довідники helsi (спільні для всіх ЛПЗ, join по ID) ──
SPEC_BY_ID = {s["specialityId"]: s["name"] for s in json.load(
    open(os.path.join(DATA, "specialities.json"), encoding="utf-8"))["specialities"]}
_POS = json.load(open(os.path.join(DATA, "positions.json"), encoding="utf-8"))["positions"]
POS_BY_ID = {p["positionId"]: p["name"] for p in _POS}
POS_PARENT = {p["positionId"]: p.get("parent") for p in _POS}          # positionId → group_X
GROUP_NAME = {p["positionId"]: p["name"] for p in _POS if p.get("isGroup")}

# ── власні надбудови (helsi їх не має) ──
DEPT_TYPES = {t["code"]: t for t in json.load(
    open(os.path.join(DATA, "department_types.json"), encoding="utf-8"))["types"]}
ROLE_MAP = json.load(open(os.path.join(DATA, "position_role_map.json"), encoding="utf-8"))


def derive_role(position_name, group):
    """RBAC-роль з надбудови: спершу name_rules (лідери), інакше дефолт по групі."""
    nm = (position_name or "").lower()
    for rule in ROLE_MAP["name_rules"]:
        if any(s in nm for s in rule.get("contains", [])) or \
           any(nm.startswith(s) for s in rule.get("startswith", [])):
            return rule["role"]
    return ROLE_MAP["group_default"].get(group)


def find_mapping(root_id):
    for f in glob.glob(os.path.join(BASE, "mappings", "*_department_mapping.json")):
        m = json.load(open(f, encoding="utf-8"))
        if m.get("organizationStructureId") == root_id:
            return f, m
    return None, None


def derive_edrpou(bundle, root):
    """ЄДРПОУ — офіційний id ЛПЗ. У корені структури helsi його часто немає,
    тож дістаємо з organization/division працівників або з user/me."""
    if root.get("edrpou"):
        return root["edrpou"]
    for r in bundle.get("resources", []):
        for key in ("organization", "division", "subdivision"):
            o = r.get(key)
            if isinstance(o, dict) and o.get("edrpou"):
                return o["edrpou"]
    u = json.dumps(bundle.get("user") or {}, ensure_ascii=False)
    import re
    m = re.search(r'"edrpou"\s*:\s*"?(\d{6,10})', u)
    return m.group(1) if m else None


def derive_org_address(bundle, root_sid):
    """Адреса ЛПЗ (тільки на рівні закладу). Розрезолвлений addressText лежить
    у organization/division об'єктах працівників (helsi не інлайнить у корінь структури)."""
    for r in bundle.get("resources", []):
        o = r.get("organization")
        if isinstance(o, dict) and o.get("structureId") == root_sid and isinstance(o.get("addresses"), dict):
            at = (o["addresses"].get("address") or {}).get("addressText")
            if at:
                return at
    for r in bundle.get("resources", []):        # fallback: головний корпус
        d = r.get("division")
        if isinstance(d, dict) and isinstance(d.get("addresses"), dict):
            at = (d["addresses"].get("address") or {}).get("addressText")
            if at:
                return at
    return None


def normalize(bundle, mapping):
    root = bundle["structure"][0]
    dept_type_by_sid = {d["structureId"]: d.get("type_code") for d in mapping["departments"]}
    edrpou = derive_edrpou(bundle, root)

    organization = {
        "id": edrpou,                      # ← первинний id ЛПЗ = ЄДРПОУ
        "edrpou": edrpou,
        "ehealth_legal_entity_id": (root.get("ehealthSync") or {}).get("associationKey"),
        "structureId": root.get("structureId"),
        "name": root.get("name"),
        "shortName": root.get("shortName"),
        "address": derive_org_address(bundle, root.get("structureId")),
        "phones": [p for p in (root.get("phones") or []) if p.get("number")] or None,
    }

    # departments (level-1 вузли структури helsi + власна надбудова direction/block)
    # org_edrpou на кожному записі: відділення = унікальна пара (org_edrpou + structureId),
    # тому відділення різних лікарень неможливо сплутати навіть у спільній базі.
    departments = []
    for node in root.get("child", []):
        code = dept_type_by_sid.get(node["structureId"])
        t = DEPT_TYPES.get(code) if code else None
        departments.append({
            "org_edrpou": edrpou,
            "structureId": node["structureId"],
            "name": node.get("name"),
            "type_code": code,
            "direction": t.get("direction") if t else None,
            "block": t.get("block") if t else None,
            "beds": node.get("bedCount"),
        })

    # empl (join позицій/спеціальностей по ID helsi)
    empl = []
    unknown_pos, unknown_spec = {}, {}
    for r in bundle["resources"]:
        pos = r.get("position") if isinstance(r.get("position"), dict) else {}
        pos_id = pos.get("positionId")
        if pos_id and pos_id not in POS_BY_ID:
            unknown_pos[pos_id] = pos.get("name")

        spec_ids = [s.get("specialityId") for s in (r.get("speciality") or []) if isinstance(s, dict)]
        for sid in spec_ids:
            if sid and sid not in SPEC_BY_ID:
                unknown_spec[sid] = next((s.get("name") for s in r["speciality"] if s.get("specialityId") == sid), None)

        group = POS_PARENT.get(pos_id)
        pos_name = POS_BY_ID.get(pos_id, pos.get("name"))
        div = r.get("division") if isinstance(r.get("division"), dict) else {}
        dep_sid = div.get("structureId")
        qual = r.get("qualification")
        empl.append({
            "org_edrpou": edrpou,
            "resourceId": r.get("resourceId"),
            "lastName": r.get("lastName"),
            "firstName": r.get("firstName"),
            "middleName": r.get("middleName"),
            "birthDate": (r.get("birthDate") or "")[:10] or None,
            "sex": r.get("sex"),
            "phone": r.get("phone"),
            "email": r.get("email"),
            "position_id": pos_id,
            "position_name": pos_name,
            "professional_group": group,
            "professional_group_name": GROUP_NAME.get(group),
            "speciality_ids": ",".join(spec_ids) if spec_ids else None,
            "speciality_names": ", ".join(SPEC_BY_ID.get(s, "?") for s in spec_ids) if spec_ids else None,
            "qualification": qual.get("name") if isinstance(qual, dict) else qual,
            "department_structureId": dep_sid,
            "department_type_code": dept_type_by_sid.get(dep_sid),
            "role": derive_role(pos_name, group),
        })

    from collections import Counter
    roles = Counter(e["role"] for e in empl)
    report = {
        "departments_total": len(departments),
        "departments_mapped": sum(1 for d in departments if d["type_code"]),
        "empl_total": len(empl),
        "empl_with_position": sum(1 for e in empl if e["position_id"]),
        "empl_with_speciality": sum(1 for e in empl if e["speciality_ids"]),
        "empl_with_department": sum(1 for e in empl if e["department_structureId"]),
        "roles": dict(roles.most_common()),
        "unknown_position_ids": unknown_pos,   # positionId, якого немає в каноні helsi (треба оновити довідник)
        "unknown_speciality_ids": unknown_spec,
    }
    return {"organization": organization, "departments": departments, "empl": empl, "_report": report}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    raw_path = sys.argv[1]
    bundle = json.load(open(raw_path, encoding="utf-8"))
    root_id = bundle["structure"][0]["structureId"]

    if "--mapping" in sys.argv:
        mapping = json.load(open(sys.argv[sys.argv.index("--mapping") + 1], encoding="utf-8"))
    else:
        mp, mapping = find_mapping(root_id)
        if not mapping:
            print(f"[!] Немає department_mapping для rootStructureId={root_id}")
            sys.exit(1)
        print(f"[i] Мапінг відділень: {os.path.relpath(mp, BASE)}")

    result = normalize(bundle, mapping)

    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]
    else:
        # без --out просимо вказати явно (немає надійного способу вивести назву теки лікарні з самих даних)
        print("[!] Вкажи --out normalized/<лікарня>/normalized.json")
        sys.exit(1)
    json.dump(result, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    rep = result["_report"]
    print(f"\n=== {bundle['structure'][0]['name'][:55]} ===")
    print(f"відділень:   {rep['departments_mapped']}/{rep['departments_total']} мапнуто в напрямки/блоки")
    print(f"працівників: {rep['empl_total']}")
    print(f"  з посадою (helsi):      {rep['empl_with_position']}")
    print(f"  зі спеціальністю (helsi):{rep['empl_with_speciality']}")
    print(f"  з відділенням:          {rep['empl_with_department']}")
    print(f"ролі: " + ", ".join(f"{k}×{v}" for k, v in rep["roles"].items()))
    if rep["unknown_position_ids"]:
        print(f"[!] positionId поза каноном ({len(rep['unknown_position_ids'])}): {rep['unknown_position_ids']}")
    if rep["unknown_speciality_ids"]:
        print(f"[!] specialityId поза каноном ({len(rep['unknown_speciality_ids'])}): {rep['unknown_speciality_ids']}")
    print(f"\n-> {os.path.relpath(out, BASE)}")


if __name__ == "__main__":
    main()
