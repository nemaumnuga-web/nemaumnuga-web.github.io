#!/usr/bin/bash
# Builds llama.cpp's server for the image (runs in a throwaway builder stage).
#
# Why not Fedora's llama-cpp RPM: it pulls ~2 GiB of ROCm (AMD-only) libraries.
# This build has every x86-64 CPU variant (picked at run time) plus Vulkan,
# which accelerates AMD, Intel and NVIDIA GPUs through their normal drivers.
set -euxo pipefail

TAG="${1:?llama.cpp tag}"
OUT=/opt/nuri-llama

if [[ -s /run/secrets/extra_ca ]]; then   # build-time proxy CA only
    cp /run/secrets/extra_ca /etc/pki/ca-trust/source/anchors/build-only.pem
    update-ca-trust extract
fi

dnf5 -y install --setopt=install_weak_deps=False \
    git-core cmake gcc-c++ glslc vulkan-headers vulkan-loader-devel \
    spirv-headers-devel openssl-devel

git clone --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp /src

cmake -S /src -B /build \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=ON \
    -DGGML_NATIVE=OFF \
    -DGGML_BACKEND_DL=ON \
    -DGGML_CPU_ALL_VARIANTS=ON \
    -DGGML_VULKAN=ON \
    -DLLAMA_BUILD_TESTS=OFF \
    -DLLAMA_BUILD_EXAMPLES=OFF \
    -DLLAMA_BUILD_UI=OFF \
    -DLLAMA_USE_PREBUILT_UI=OFF \
    -DCMAKE_BUILD_RPATH_USE_ORIGIN=ON \
    -DCMAKE_BUILD_RPATH='$ORIGIN'
cmake --build /build -j"$(nproc)" --target llama-server
# Backends are runtime-loaded modules, not link dependencies of llama-server:
# build everything under ggml/ (all CPU variants + Vulkan) explicitly.
make -C /build/ggml -j"$(nproc)"
ls /build/bin/libggml-vulkan.so /build/bin/libggml-cpu-*.so

# Executable, shared libs and dynamically loaded backends side by side;
# llama.cpp looks for backends next to the (real) executable path.
mkdir -p "$OUT"
cp -a /build/bin/llama-server "$OUT"/
find /build/bin -maxdepth 1 -name '*.so*' -exec cp -a {} "$OUT"/ \;
cp /src/LICENSE "$OUT"/LICENSE
echo "$TAG" > "$OUT"/VERSION
ls -la "$OUT"
