#!/usr/bin/bash
# Runs inside the image build. Keep every step idempotent and non-interactive.
set -euxo pipefail

CTX="$(dirname "$(readlink -f "$0")")"

# Build-time only: trust an extra CA (corporate/sandbox proxy), then restore
# the original bundle so the shipped image trusts exactly what Fedora ships.
EXTRA_CA=/run/secrets/extra_ca
ANCHOR=/etc/pki/ca-trust/source/anchors/nuri-build-only.pem
if [[ -s "$EXTRA_CA" ]]; then
    cp "$EXTRA_CA" "$ANCHOR"
    update-ca-trust extract
    trap 'rm -f "$ANCHOR"; update-ca-trust extract' EXIT
fi

for step in "$CTX"/[0-9][0-9]-*.sh; do
    echo "==> ${step##*/}"
    bash "$step"
done

# Leave no build caches or logs in the image.
dnf5 clean all
rm -rf /var/log/dnf5.log* /tmp/* || true

# Fails the build if the image is not a valid bootc image.
if command -v bootc >/dev/null; then
    bootc container lint
fi
