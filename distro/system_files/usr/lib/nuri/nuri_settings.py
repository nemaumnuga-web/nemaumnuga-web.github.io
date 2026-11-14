"""Desktop settings shared by Nuri Welcome and Nuri Control Center.

Each function returns the commands (argv lists) that apply a setting with
Plasma's own tools, so callers can run them, log them, or test them.
Values are checked against fixed lists: nothing user-typed reaches a command.
"""
import os
import re
import shutil
import subprocess
from pathlib import Path

ACCENTS = ["#6366f1", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#22c55e", "#64748b"]
POWER_PROFILES = ["power-saver", "balanced", "performance"]


def kwrite(file, group, key, value):
    return ["kwriteconfig6", "--file", file, "--group", group, "--key", key, value]


def reload_kwin():
    return ["dbus-send", "--session", "--type=signal", "/KWin", "org.kde.KWin.reloadConfig"]


def appearance(dark):
    scheme, deco = ("NuriDark", "__aurorae__svg__NuriDark") if dark else ("Nuri", "__aurorae__svg__Nuri")
    return [["plasma-apply-colorscheme", scheme],
            kwrite("kwinrc", "org.kde.kdecoration2", "library", "org.kde.kwin.aurorae"),
            kwrite("kwinrc", "org.kde.kdecoration2", "theme", deco),
            reload_kwin()]


def accent(color):
    return [["plasma-apply-colorscheme", "--accent-color", color]] if color in ACCENTS else []


def buttons_left(left):
    return [kwrite("kwinrc", "org.kde.kdecoration2", "ButtonsOnLeft", "XIA" if left else ""),
            kwrite("kwinrc", "org.kde.kdecoration2", "ButtonsOnRight", "" if left else "IAX"),
            reload_kwin()]


def single_click(single):
    return [kwrite("kdeglobals", "KDE", "SingleClick", "true" if single else "false")]


def night_light(on):
    return [kwrite("kwinrc", "NightColor", "Active", "true" if on else "false"), reload_kwin()]


def wifi(on):
    return [["nmcli", "radio", "wifi", "on" if on else "off"]]


def bluetooth(on):
    return [["rfkill", "unblock" if on else "block", "bluetooth"]]


def volume(pct):
    pct = max(0, min(100, int(pct)))
    return [["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "%d%%" % pct]]


def brightness(pct):
    pct = max(1, min(100, int(pct)))
    return [["dbus-send", "--session", "--type=method_call", "--dest=org.kde.Solid.PowerManagement",
             "/org/kde/Solid/PowerManagement/Actions/BrightnessControl",
             "org.kde.Solid.PowerManagement.Actions.BrightnessControl.setBrightness", "int32:%d" % (pct * 100)]]


def power_profile(name):
    return [["powerprofilesctl", "set", name]] if name in POWER_PROFILES else []


def do_not_disturb(on):
    # Plasma reads this from plasmanotifyrc; an empty value ends it.
    return [kwrite("plasmanotifyrc", "DoNotDisturb", "Until", "2099-01-01T00:00:00" if on else "")]


LAUNCH = {
    "assistant": ["nuri-assistant"],
    "library": ["nuri-assistant", "--library"],
    "screenshot": ["spectacle", "--region"],
    "lock": ["loginctl", "lock-session"],
    "settings": ["systemsettings"],
    "sysinfo": ["kinfocenter"],
    "updates": ["plasma-discover", "--mode", "Update"],
    "bottles": ["plasma-discover", "appstream://com.usebottles.bottles"],
    "input": ["fcitx5-configtool"],
    "files": ["dolphin"],
    "localsend": ["flatpak", "run", "org.localsend.localsend_app"],
    "welcome": ["nuri-welcome"],
}


class Runner:
    """Runs command lists in the background, or only records them (dry run)."""

    def __init__(self, dry=False):
        self.dry = dry
        self.log = []

    def run(self, cmds):
        ok = True
        for argv in cmds:
            self.log.append(" ".join(argv))
            if self.dry:
                continue
            if not shutil.which(argv[0]):
                ok = False
                continue
            subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
        return ok


# ------------------------------------------------------------------ system facts

def _read(path, default=""):
    try:
        return Path(path).read_text()
    except OSError:
        return default


def os_info():
    rel = {}
    for line in _read("/usr/lib/os-release").splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            rel[k] = v.strip().strip('"')
    return {"name": rel.get("VARIANT") or rel.get("NAME", "Nuri OS"),
            "version": rel.get("IMAGE_VERSION", rel.get("VERSION_ID", "")),
            "pretty": rel.get("PRETTY_NAME", ""),
            "base": ("Fedora " + rel.get("VERSION_ID", "")) if rel.get("ID") == "fedora" else rel.get("NAME", "Linux")}


def cpu_model():
    m = re.search(r"^model name\s*:\s*(.+)$", _read("/proc/cpuinfo"), re.M)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else "CPU"


def cpu_count():
    return os.cpu_count() or 1


def mem():
    """(total GB, used GB) from /proc/meminfo."""
    info = {}
    for line in _read("/proc/meminfo").splitlines():
        parts = line.split()
        if len(parts) >= 2:
            info[parts[0].rstrip(":")] = int(parts[1])
    total = info.get("MemTotal", 0) / 1048576
    avail = info.get("MemAvailable", 0) / 1048576
    return total, max(0.0, total - avail)


def disk(path="/var"):
    """(total GB, used GB) of the filesystem holding user data."""
    try:
        st = os.statvfs(path if os.path.exists(path) else "/")
    except OSError:
        return 0.0, 0.0
    total = st.f_blocks * st.f_frsize / 1e9
    free = st.f_bavail * st.f_frsize / 1e9
    return total, total - free


def gpu():
    """First display adapter name from sysfs/lspci, or empty."""
    if shutil.which("lspci"):
        try:
            out = subprocess.run(["lspci"], capture_output=True, text=True, timeout=3).stdout
            for line in out.splitlines():
                if re.search(r"VGA|3D controller|Display controller", line):
                    return line.split(": ", 1)[-1].strip()
        except (OSError, subprocess.SubprocessError):
            pass
    return ""


_last_cpu = None


def cpu_percent():
    """CPU use since the previous call (first call: since boot)."""
    global _last_cpu
    f = _read("/proc/stat").splitlines()
    if not f:
        return 0.0
    vals = [int(v) for v in f[0].split()[1:]]
    idle, total = vals[3] + (vals[4] if len(vals) > 4 else 0), sum(vals)
    prev, _last_cpu = _last_cpu, (idle, total)
    if not prev or total == prev[1]:
        return 0.0
    return max(0.0, min(100.0, 100.0 * (1 - (idle - prev[0]) / (total - prev[1]))))


def battery():
    """(percent, charging) of the first battery, or None on desktops."""
    for b in sorted(Path("/sys/class/power_supply").glob("BAT*")):
        cap = _read(b / "capacity").strip()
        if cap.isdigit():
            return int(cap), _read(b / "status").strip() == "Charging"
    return None


def uptime_hours():
    try:
        return float(_read("/proc/uptime").split()[0]) / 3600
    except (IndexError, ValueError):
        return 0.0
