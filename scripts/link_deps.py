# -*- coding: utf-8 -*-
"""把 dsh 宿主依赖以 Windows 目录联接(junction)接到本插件 node_modules。

宿主来源（二选一，按可用性自动回退）：
1. DSH_SOURCE: dsh 源码 checkout 的 packages 目录（D:\\code\\deepseek-harness\\packages）
2. CACHE_AI:   npx 缓存里的 dsh 发布包（按 link_deps 说明自行定位）

用法：python scripts/link_deps.py
"""
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "..", "node_modules")

# 源码 checkout 优先（本机已存在）
DSH_SOURCE = r"D:\code\deepseek-harness\packages"
# npx 缓存回退
CACHE_AI = r"C:\Users\sczl\AppData\Local\npm-cache\_npx"
CACHE_TOP = CACHE_AI

# Node 端宿主依赖（构建/类型用；运行时由 dsh Loader 提供）
NODE_DEPS = [
    "cordis", "cosmokit", "schemastery", "cordis-plugin-loader",
    "dsh-tools", "dsh-system-prompt",
]
# 浏览器端宿主依赖（设置面板浏览器半侧用；运行时由 web shell 模块表提供）
# 注意:checkout 的 client 包目录名是 dsh-client-* / dsh-ui-* 对应包名
# @deepseek-ai/dsh-client-store 等,包名 → 目录名映射在这里显式给出。
CLIENT_DEPS = [
    "dsh-client-store", "dsh-client-locale", "dsh-api-remotes",
    "dsh-client-ui-primitives", "dsh-client-ui-slots",
    "dsh-client-ui-plugin-manager", "dsh-client-ui-settings",
    "dsh-client-ui-renderer",
]


def find_pkg(name):
    """在源码 checkout 与 npx 缓存中定位 @deepseek-ai/<name>。"""
    src = os.path.join(DSH_SOURCE, name)
    if os.path.isdir(src):
        return src
    # 源码 checkout 中 client 包目录名与包名不同:包名 dsh-client-ui-primitives
    # 对应目录 packages/client/ui-primitives、dsh-api-remotes 对应 packages/api/remotes。
    # 相对 checkout 的 packages 根解析,不做 .. 跳级。
    CHECKOUT = os.path.dirname(DSH_SOURCE)  # .../deepseek-harness
    PKGS = os.path.join(CHECKOUT, "packages")
    ALIASES = {
        "cordis-plugin-loader": os.path.join(CHECKOUT, "vendor", "loader"),
        "dsh-client-store": os.path.join(PKGS, "client", "store"),
        "dsh-client-locale": os.path.join(PKGS, "client", "locale"),
        "dsh-api-remotes": os.path.join(PKGS, "api", "remotes"),
        "dsh-client-ui-primitives": os.path.join(PKGS, "client", "ui-primitives"),
        "dsh-client-ui-slots": os.path.join(PKGS, "client", "ui-slots"),
        "dsh-client-ui-plugin-manager": os.path.join(PKGS, "client", "ui-plugin-manager"),
        "dsh-client-ui-settings": os.path.join(PKGS, "client", "ui-settings"),
        "dsh-client-ui-renderer": os.path.join(PKGS, "client", "ui-renderer"),
        "dsh-client-runtime": os.path.join(PKGS, "client", "modules"),
    }
    alias = ALIASES.get(name)
    if alias and os.path.isdir(alias):
        return alias
    if os.path.isdir(CACHE_AI):
        for entry in os.listdir(CACHE_AI):
            cand = os.path.join(CACHE_AI, entry, "node_modules", "@deepseek-ai", name)
            if os.path.isdir(cand):
                return cand
    return None


def junction(dst, src):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.isdir(dst) and not os.path.islink(dst):
        return "exists"
    if os.path.islink(dst) or os.path.exists(dst):
        os.remove(dst)
    subprocess.run(["cmd", "/c", "mklink", "/J", dst, src], check=True, capture_output=True)
    return "linked"


def main():
    linked, missing = [], []
    # cordis/schemastery must resolve to the SAME copies the client packages'
    # own merges use (checkout vendor), otherwise declare-module Context
    # merges land on a different interface AND the published schemastery
    # (3.18.2) lacks .volatile() which the settings-card flow requires.
    for vendored, dst_name in (("vendor", "cordis"), ("vendor", "schemastery")):
        dst = os.path.join(TARGET, "@deepseek-ai", dst_name)
        if os.path.islink(dst):
            os.rmdir(dst)
        if os.path.isdir(dst) and not os.path.islink(dst):
            continue
        src = os.path.join(os.path.dirname(DSH_SOURCE), vendored, dst_name)
        try:
            junction(dst, src)
            linked.append(f"{dst_name}({vendored})")
        except Exception as e:  # noqa: BLE001
            missing.append(f"{dst_name}({vendored})({e})")
    for name in [n for n in NODE_DEPS + CLIENT_DEPS if n != "cordis"]:
        dst = os.path.join(TARGET, "@deepseek-ai", name)
        if os.path.isdir(dst) and not os.path.islink(dst):
            continue
        src = find_pkg(name)
        if src:
            try:
                junction(dst, src)
                linked.append(name)
            except Exception as e:  # noqa: BLE001
                missing.append(f"{name}({e})")
        else:
            missing.append(name)

    print("linked:", linked)
    print("missing:", missing if missing else "none")
    if missing:
        raise SystemExit("有缺失的宿主依赖，请检查 DSH_SOURCE / CACHE_AI 路径。")


if __name__ == "__main__":
    main()
