# -*- coding: utf-8 -*-
"""把最新构建产物同步到已安装 profile 里的插件（file: 依赖是复制，需手动刷新）。

用法：python scripts/sync_profile.py [profile 名，默认 web]
"""
import os
import shutil
import sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILE = sys.argv[1] if len(sys.argv) > 1 else "web"
HOME = os.path.expanduser("~")
DST = None
for candidate in [
    os.path.join(HOME, ".dsh", "profiles", PROFILE, "node_modules", "dsh-grafana-plugin"),
    os.path.join(HOME, "AppData", "Roaming", "dsh", "profiles", PROFILE, "node_modules", "dsh-grafana-plugin"),
]:
    if os.path.isdir(candidate):
        DST = candidate
        break

if DST is None:
    print("profile 未找到已安装的插件，请先：dsh plugin --profile %s add file:%s" % (PROFILE, SRC))
    raise SystemExit(1)

dst_lib = os.path.join(DST, "lib")
shutil.rmtree(dst_lib, ignore_errors=True)
shutil.copytree(os.path.join(SRC, "lib"), dst_lib)
shutil.copy2(os.path.join(SRC, "cordis.patch.yml"), os.path.join(DST, "cordis.patch.yml"))
shutil.copy2(os.path.join(SRC, "package.json"), os.path.join(DST, "package.json"))
print("synced:", DST)
