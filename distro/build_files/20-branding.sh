#!/usr/bin/bash
# OS identity. ID stays "fedora" on purpose: installers and tools such as
# bootc-image-builder pick their defaults from it.
set -euxo pipefail

: "${NURI_VERSION:=dev}"
OSR=/usr/lib/os-release

sed -i \
    -e 's/^PRETTY_NAME=.*/PRETTY_NAME="Nuri OS '"${NURI_VERSION}"' (Fedora '"${FEDORA_VERSION}"' base)"/' \
    -e 's/^VARIANT=.*/VARIANT="Nuri OS"/' \
    -e 's/^VARIANT_ID=.*/VARIANT_ID=nuri/' \
    "$OSR"
grep -q '^VARIANT_ID=' "$OSR" || echo 'VARIANT_ID=nuri' >> "$OSR"
grep -q '^IMAGE_VERSION=' "$OSR" || echo "IMAGE_VERSION=${NURI_VERSION}" >> "$OSR"
