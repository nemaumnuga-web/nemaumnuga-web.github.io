# Nuri OS developer tasks. Needs podman (or docker) on the build machine.
#
#   make test        unit tests for nuri-ai (no network, no container)
#   make registry    re-pin the model registry against Hugging Face
#   make art         regenerate wallpapers, colour schemes, icons, window decoration,
#                    Plasma style, logo PNG and theme previews
#   make previews    render the desktop previews inside the built image (needs KSvg)
#   make build       build the OS image
#   make iso         build an installable ISO from the image (podman, root)
#   make run         open a shell inside the image

IMAGE      ?= localhost/nuri
TAG        ?= dev
FEDORA     ?= 45
ENGINE     ?= $(shell command -v podman 2>/dev/null || echo docker)
# Optional CA for building behind a TLS-intercepting proxy; never kept in the image.
EXTRA_CA   ?=
SECRET      = $(if $(EXTRA_CA),--secret id=extra_ca$(comma)src=$(EXTRA_CA),)
comma      := ,

.PHONY: test registry art previews build iso run lint clean

test:
	python3 -m unittest discover -s tests -v

registry:
	python3 tools/pin_models.py

art:
	python3 tools/make_wallpaper.py
	python3 tools/make_color_schemes.py
	python3 tools/make_icons.py
	python3 tools/make_decoration.py
	python3 tools/make_plasma_theme.py
	python3 tools/render_qml.py system_files/usr/lib/nuri/qml/Logo.qml \
		system_files/usr/share/pixmaps/nuri-logo.png 256x256 --prop size=256 --transparent --wait 300
	python3 tools/make_previews.py

previews:
	$(ENGINE) run --rm -v "$(CURDIR):/src:z" -w /src -e HOME=/tmp --entrypoint python3 \
		$(IMAGE):$(TAG) tools/make_desktop_previews.py

lint:
	bash -n build_files/*.sh system_files/usr/libexec/nuri/* tools/*.sh
	python3 -m py_compile system_files/usr/bin/nuri-ai system_files/usr/bin/nuri-assistant system_files/usr/bin/nuri-welcome system_files/usr/lib/nuri/*.py tools/*.py

build: lint
	$(ENGINE) build -f Containerfile $(SECRET) \
		--build-arg FEDORA_VERSION=$(FEDORA) --build-arg NURI_VERSION=$(TAG) \
		-t $(IMAGE):$(TAG) .

iso:
	mkdir -p output
	sudo podman run --rm -it --privileged --pull=newer \
		--security-opt label=type:unconfined_t \
		-v ./iso/config.toml:/config.toml:ro \
		-v ./output:/output \
		-v /var/lib/containers/storage:/var/lib/containers/storage \
		quay.io/centos-bootc/bootc-image-builder:latest \
		--type anaconda-iso --rootfs btrfs --use-librepo=True \
		$(IMAGE):$(TAG)

run:
	$(ENGINE) run --rm -it --entrypoint bash $(IMAGE):$(TAG)

clean:
	rm -rf output
