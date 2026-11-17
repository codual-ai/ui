"""Prints each failed test in an Xcode result bundle with its failure messages, which `xcodebuild -quiet` leaves out."""

import json
import subprocess
import sys


def failures(node, path):
    name = node.get("name", "")
    here = path + [name] if node.get("nodeType") not in (None, "Failure Message") else path
    if node.get("result") == "Failed" and node.get("nodeType") == "Test Case":
        messages = [child.get("name", "") for child in node.get("children", []) if child.get("nodeType") == "Failure Message"]
        yield " / ".join(here), messages
    for child in node.get("children", []):
        yield from failures(child, here)


for bundle in sys.argv[1:]:
    result = subprocess.run(
        ["xcrun", "xcresulttool", "get", "test-results", "tests", "--path", bundle, "--format", "json"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"{bundle}: {result.stderr.strip()}")
        continue
    for root in json.loads(result.stdout).get("testNodes", []):
        for test, messages in failures(root, []):
            print(f"FAILED {test}")
            for message in messages or ["(no failure message)"]:
                print(f"  {message}")
