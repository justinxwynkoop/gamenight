"""A small App Store Connect helper for the TestFlight workflow (adapted from the one in the Buzzworthy Apple TV app,
github.com/JasonWynkoop1/buzzworthy).

    python3 Tools/asc.py prepare BUNDLE_ID APP_NAME
    python3 Tools/asc.py notes APP_ID VERSION BUILD NOTES_FILE

"notes" waits for the uploaded build to show up in App Store Connect (up to 30 minutes) and sets its TestFlight
"What to Test" text, which the TestFlight app on the Apple TV shows before you update.

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


def diagnose():
    """Says what shape the secrets are in (never their values), for a sign-in Apple refused."""
    import re
    kid = os.environ.get("ASC_KEY_ID", "")
    iss = os.environ.get("ASC_ISSUER_ID", "")
    print(f"ASC_KEY_ID: {len(kid)} characters, {'looks right' if re.fullmatch(r'[A-Z0-9]{10}', kid) else 'expected 10 capital letters and digits'}")
    print(f"ASC_ISSUER_ID: {len(iss)} characters, {'looks right' if re.fullmatch(r'[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}', iss) else 'expected a 36-character id like 1a2b3c4d-...'}")
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        k = load_pem_private_key(open(os.environ["ASC_KEY_PATH"], "rb").read(), None)
        print(f"ASC_KEY_P8: loads, curve {getattr(getattr(k, 'curve', None), 'name', '?')} (App Store Connect keys are secp256r1)")
    except Exception as e:
        print(f"ASC_KEY_P8: does not load ({type(e).__name__})")
    print("If all three look right: the key may be an Individual key (use a Team key), revoked, or from another team, "
          "or ASC_KEY_ID may not be the ID of the key in ASC_KEY_P8 (the file is named AuthKey_<KEY ID>.p8).")


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
        if status == 401:
            diagnose()
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

    # Apple's API now and then answers with an error or an empty list for an app that exists (a build went up fine
    # hours before such a run), so ask a few times before deciding, and never treat an error as "no app".
    for attempt in range(5):
        if attempt:
            time.sleep(10 * attempt)
        status, res = call("GET", "/v1/apps", params={"filter[bundleId]": bundle_id})
        apps = [a for a in res.get("data", []) if a["attributes"].get("bundleId") == bundle_id] if status == 200 else []
        if apps:
            break
        print(f"Looking up the app for {bundle_id}: {'no match' if status == 200 else f'error {status}'} (try {attempt + 1} of 5)")
    if status != 200:
        sys.exit(f"App Store Connect would not list the apps ({status}), so nothing was uploaded. Run the workflow again. {res}")
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
    try:
        latest_version, latest_build = latest_upload(app_id)
    except Exception as e:  # the workflow still has the repository's own version to go on
        print(f"::warning::Could not read the builds already in TestFlight: {e}")
        latest_version, latest_build = "", 0
    output(team_id=team, app_exists="true", app_id=app_id, latest_version=latest_version, latest_build=latest_build)


def version_key(v):
    return tuple(int(p) for p in v.split(".") if p.isdigit())


def latest_upload(app_id):
    """The highest version in TestFlight and the highest build number uploaded for it, from any Mac or workflow, so the
    next upload can go above both. Also prints the most recent uploads, which shows where each one came from."""
    status, res = call("GET", "/v1/preReleaseVersions", params={"filter[app]": app_id, "limit": 200})
    if status != 200:
        raise RuntimeError(f"preReleaseVersions {status}")
    versions = [v["attributes"]["version"] for v in res.get("data", [])]
    latest_version = max(versions, key=version_key) if versions else ""
    status, res = call("GET", "/v1/builds", params={
        "filter[app]": app_id, "sort": "-uploadedDate", "limit": 200, "include": "preReleaseVersion"})
    if status != 200:
        raise RuntimeError(f"builds {status}")
    names = {i["id"]: i["attributes"]["version"] for i in res.get("included", []) if i["type"] == "preReleaseVersions"}
    builds = res.get("data", [])
    print("Most recent TestFlight uploads (newest first):")
    for b in builds[:10]:
        a = b["attributes"]
        rel = (b.get("relationships", {}).get("preReleaseVersion", {}).get("data") or {}).get("id")
        print(f"  {names.get(rel, '?')} ({a.get('version')})  uploaded {a.get('uploadedDate')}  {a.get('processingState')}")
    # Build numbers only need to go up within one version, so look at the highest version's builds alone.
    numbers = [int(b["attributes"]["version"]) for b in builds if str(b["attributes"].get("version", "")).isdigit()
               and names.get((b.get("relationships", {}).get("preReleaseVersion", {}).get("data") or {}).get("id")) == latest_version]
    return latest_version, max(numbers, default=0)


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


def find_build(app_id, version, build, wait=1800):
    """The id of the upload VERSION (BUILD), waiting while Apple receives it."""
    deadline = time.time() + wait
    while True:
        status, res = call("GET", "/v1/builds", params={
            "filter[app]": app_id, "filter[version]": build, "filter[preReleaseVersion.version]": version, "limit": 5})
        if status == 200 and res.get("data"):
            return res["data"][0]["id"]
        if time.time() > deadline:
            return None
        print(f"Waiting for {version} ({build}) to appear in App Store Connect ({'not yet' if status == 200 else f'error {status}'})")
        time.sleep(30)


def notes(app_id, version, build, path):
    text = open(path, encoding="utf-8").read().strip()[:3900] or f"Version {version} ({build})"
    build_id = find_build(app_id, version, build)
    if not build_id:
        print(f"::warning::{version} ({build}) did not show up in App Store Connect within 30 minutes, so it has no What to Test notes.")
        return
    status, res = call("GET", f"/v1/builds/{build_id}/betaBuildLocalizations", params={"limit": 50})
    have = [l for l in res.get("data", []) if l["attributes"].get("locale") == "en-US"] if status == 200 else []
    if have:
        status, res = call("PATCH", f"/v1/betaBuildLocalizations/{have[0]['id']}", {
            "data": {"type": "betaBuildLocalizations", "id": have[0]["id"], "attributes": {"whatsNew": text}}})
    else:
        status, res = call("POST", "/v1/betaBuildLocalizations", {
            "data": {"type": "betaBuildLocalizations", "attributes": {"locale": "en-US", "whatsNew": text},
                     "relationships": {"build": {"data": {"type": "builds", "id": build_id}}}}})
    if status not in (200, 201):
        print(f"::warning::Could not set the What to Test notes ({status}): {res}")
        return
    print(f"What to Test for {version} ({build}):\n{text}")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "prepare":
        prepare(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 6 and sys.argv[1] == "notes":
        notes(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
    else:
        sys.exit(__doc__)
