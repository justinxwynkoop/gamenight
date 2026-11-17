"""A small App Store Connect helper for the TestFlight workflow (adapted from the one in the Buzzworthy Apple TV app,
github.com/JasonWynkoop1/buzzworthy).

    python3 Tools/asc.py prepare BUNDLE_ID APP_NAME

Needs the environment variables ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH (the .p8 key file). It registers the bundle ID if
needed, finds the Apple developer team that owns it, checks that the app exists in App Store Connect, and makes sure there
is an internal TestFlight group called "Family" that gets every build. It does NOT add or invite anyone: add testers in
App Store Connect (see docs/TESTFLIGHT.md). Writes key=value lines to $GITHUB_OUTPUT.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

API = "https://api.appstoreconnect.apple.com"
GROUP = "Family"


def token():
    key = open(os.environ["ASC_KEY_PATH"]).read()
    now = int(time.time())
    return jwt.encode(
        {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
        key,
        algorithm="ES256",
        headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"},
    )


def call(method, path, body=None, params=None):
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token())
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="replace")}


def output(**kv):
    lines = "".join(f"{k}={v}\n" for k, v in kv.items())
    print(lines, end="")
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            f.write(lines)


def prepare(bundle_id, app_name):
    status, res = call("GET", "/v1/bundleIds", params={"filter[identifier]": bundle_id, "limit": 200})
    if status != 200:
        sys.exit(f"Could not read bundle IDs ({status}). Check the API key secrets and that the key has the Admin role. {res}")
    match = [b for b in res.get("data", []) if b["attributes"]["identifier"] == bundle_id]
    if match:
        bundle = match[0]
    else:
        status, res = call("POST", "/v1/bundleIds", {
            "data": {"type": "bundleIds", "attributes": {"identifier": bundle_id, "name": app_name, "platform": "IOS"}}
        })
        if status not in (200, 201):
            sys.exit(f"Could not register bundle ID {bundle_id} ({status}): {res}")
        bundle = res["data"]
        print(f"Registered bundle ID {bundle_id}")
    team = bundle["attributes"].get("seedId", "")

    status, res = call("GET", "/v1/apps", params={"filter[bundleId]": bundle_id})
    apps = [a for a in res.get("data", []) if a["attributes"].get("bundleId") == bundle_id] if status == 200 else []
    if not apps:
        output(team_id=team, app_exists="false")
        print(f"::warning::There is no app with bundle ID {bundle_id} in App Store Connect yet. Create it "
              f"(Apps, +, New App, platform tvOS, bundle ID {bundle_id}), then run this workflow again.")
        return
    app_id = apps[0]["id"]

    try:
        ensure_group(app_id)
    except Exception as e:  # never block the upload over the tester group
        print(f"::warning::Could not set up the TestFlight group automatically: {e}")
    output(team_id=team, app_exists="true", app_id=app_id)


def ensure_group(app_id):
    status, res = call("GET", f"/v1/apps/{app_id}/betaGroups", params={"limit": 200})
    groups = [g for g in res.get("data", []) if g["attributes"].get("isInternalGroup")] if status == 200 else []
    if any(g["attributes"]["name"] == GROUP for g in groups):
        return
    status, res = call("POST", "/v1/betaGroups", {
        "data": {
            "type": "betaGroups",
            "attributes": {"name": GROUP, "isInternalGroup": True, "hasAccessToAllBuilds": True},
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
        }
    })
    if status not in (200, 201):
        raise RuntimeError(f"create group {status}: {res}")
    print(f"Created the internal TestFlight group '{GROUP}'")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "prepare":
        prepare(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
