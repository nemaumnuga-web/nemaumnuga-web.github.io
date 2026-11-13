// Nuri OS default desktop layout (Plasma 6 scripting API).
// Runs once, on a user's first login: a slim top bar with the app menu,
// the focused app's global menu, tray and clock, plus a centred floating dock.

var WALLPAPER = "file:///usr/share/wallpapers/Nuri/contents/images/3840x2160.png";

// ---- desktop & wallpaper
var all = desktops();
for (var i = 0; i < all.length; ++i) {
    var d = all[i];
    d.wallpaperPlugin = "org.kde.image";
    d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
    d.writeConfig("Image", WALLPAPER);
}

// ---- top bar
var top = new Panel;
top.location = "top";
top.height = Math.round(gridUnit * 1.5);
top.floating = false;

var launcher = top.addWidget("org.kde.plasma.kickoff");
launcher.currentConfigGroup = ["General"];
launcher.writeConfig("icon", "nuri-assistant");

top.addWidget("org.kde.plasma.appmenu");
top.addWidget("org.kde.plasma.panelspacer");
// Input-method indicator (한/A) - what Plasma's own default panel adds for CJK locales
top.addWidget("org.kde.plasma.kimpanel");
top.addWidget("org.kde.plasma.systemtray");

var clock = top.addWidget("org.kde.plasma.digitalclock");
clock.currentConfigGroup = ["Appearance"];
clock.writeConfig("showDate", "true");
clock.writeConfig("dateFormat", "shortDate");

// ---- dock
var dock = new Panel;
dock.location = "bottom";
dock.height = Math.round(gridUnit * 3.4);
dock.alignment = "center";
dock.lengthMode = "fit";
dock.floating = true;
dock.hiding = "dodgewindows";

var tasks = dock.addWidget("org.kde.plasma.icontasks");
tasks.currentConfigGroup = ["General"];
tasks.writeConfig("launchers", [
    "applications:org.kde.dolphin.desktop",
    "applications:org.mozilla.firefox.desktop",
    "applications:nuri-assistant.desktop",
    "applications:org.kde.konsole.desktop",
    "applications:org.kde.discover.desktop",
    "applications:systemsettings.desktop"
].join(","));
tasks.writeConfig("showOnlyCurrentDesktop", "false");
tasks.writeConfig("indicateAudioStreams", "true");

dock.addWidget("org.kde.plasma.marginsseparator");
dock.addWidget("org.kde.plasma.trash");
