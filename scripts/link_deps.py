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
    "cordis", "cosmokit", "schemastery",
    "dsh-tools", "dsh-system-prompt",
]


def find_pkg(name):
    """在源码 checkout 与 npx 缓存中定位 @deepseek-ai/<name>。"""
    src = os.path.join(DSH_SOURCE, name)
    if os.path.isdir(src):
        return src
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
    for name in NODE_DEPS:
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
