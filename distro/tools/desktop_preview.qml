// Composed preview of the default Nuri desktop, for docs and theme thumbnails.
// The theme art is real and drawn by KDE's own SVG frame engine (KSvg), the same
// one Plasma and the window decoration use:
//   wallpaper, Plasma style "Nuri" (glass top bar + dock, task dots),
//   Aurorae decoration "Nuri"/"NuriDark" (title bar, traffic-light buttons),
//   icon theme "Nuri".
// The scene itself (window contents, menu text, tray) is a mock-up, NOT a capture
// of a running session.
//
//   QT_QUICK_BACKEND=software python3 tools/render_qml.py tools/desktop_preview.qml out.png 1920x1080 \
//       --prop base=/path/to/system_files/usr/share [--prop dark=1]
// tools/make_desktop_previews.py drives this inside the OS image (KSvg is needed).
import QtQuick
import org.kde.ksvg as KSvg

Item {
    id: root
    width: 1920
    height: 1080
    property string base: "/usr/share"
    property real dark: 0
    readonly property bool isDark: dark > 0
    readonly property string deco: base + "/aurorae/themes/" + (isDark ? "NuriDark" : "Nuri") + "/"
    property string plasmaDir: ""   // optional override (pre-coloured copy for the dark preview)
    readonly property string plasma: (plasmaDir || base + "/plasma/desktoptheme/Nuri") + "/"
    readonly property color fg: isDark ? "#ececf4" : "#1d1e27"
    readonly property color sub: isDark ? "#9a9db2" : "#6a6d80"
    readonly property color win: isDark ? "#161721" : "#f4f5fa"
    readonly property color view: isDark ? "#1c1d29" : "#ffffff"
    readonly property color line: isDark ? "#2a2c3b" : "#e3e5ee"
    function icon(ctx, name) { return "file://" + base + "/icons/Nuri/scalable/" + ctx + "/" + name + ".svg" }
    function breeze(path) { return "file:///usr/share/icons/" + (isDark ? "breeze-dark/" : "breeze/") + path }

    Image {
        anchors.fill: parent
        source: "file://" + root.base + "/wallpapers/Nuri/contents/" + (root.isDark ? "images_dark" : "images")
                + "/1920x1080.jpg"
        fillMode: Image.PreserveAspectCrop
    }

    // ------------------------------------------------------------ a window
    component DecoratedWindow: Item {
        id: w
        property bool active: true
        property string title
        default property alias content: client.data
        // decoration geometry from the theme rc: padding 24/16/24/32, title 34, border 1
        KSvg.FrameSvgItem {
            x: -25; y: -50
            width: w.width + 50; height: w.height + 83
            imagePath: root.deco + "decoration.svg"
            prefix: w.active ? "decoration" : "decoration-inactive"
        }
        Row {
            x: 12 - 1; y: -34 + 8
            spacing: 3
            Repeater {
                model: ["close", "minimize", "maximize"]
                KSvg.FrameSvgItem {
                    width: 18; height: 18
                    imagePath: root.deco + modelData + ".svg"
                    prefix: w.active ? "active" : "inactive"
                }
            }
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            y: -34
            height: 34
            verticalAlignment: Text.AlignVCenter
            text: w.title
            font.pixelSize: 13
            font.weight: Font.DemiBold
            color: w.active ? root.fg : root.sub
        }
        Item { id: client; anchors.fill: parent; clip: true }
    }

    // inactive terminal behind
    DecoratedWindow {
        x: 250; y: 150; width: 720; height: 430
        active: false
        title: "터미널"
        Rectangle { anchors.fill: parent; color: "#14151c" }
        Column {
            x: 16; y: 14; spacing: 6
            Repeater {
                model: [
                    ["#5eead4", "~ $ nuri-ai models --lang ko"],
                    ["#c9cbd8", "✨ A  Kanana 2 · 3B        2.1 GB   빠름"],
                    ["#c9cbd8", "✨ B  HyperCLOVA X SEED · 1.5B  1.1 GB"],
                    ["#c9cbd8", "   C  Qwen3.5 · 4B          2.7 GB"],
                    ["#5eead4", "~ $ nuri-ai use kanana-2-3b"],
                    ["#c9cbd8", "활성 모델: Kanana 2 · 3B (로컬, 오프라인)"],
                    ["#5eead4", "~ $ ▍"]
                ]
                Text {
                    text: modelData[1]; color: modelData[0]
                    font.family: "Noto Sans Mono CJK KR"; font.pixelSize: 15
                }
            }
        }
    }

    // active file manager
    DecoratedWindow {
        id: files
        x: 560; y: 250; width: 1040; height: 590
        title: "홈"
        Rectangle { anchors.fill: parent; color: root.win }
        // toolbar
        Row {
            x: 14; y: 8; spacing: 6
            Repeater {
                model: ["actions/22/go-previous.svg", "actions/22/go-next.svg"]
                Rectangle {
                    width: 30; height: 28; radius: 7; color: "transparent"
                    Image { anchors.centerIn: parent; width: 18; height: 18; source: root.breeze(modelData) }
                }
            }
        }
        Rectangle {
            x: 330; y: 8; width: 420; height: 28; radius: 8
            color: root.isDark ? "#20212e" : "#e9ebf3"
            Text { anchors.centerIn: parent; text: "홈"; color: root.fg; font.pixelSize: 13 }
        }
        Rectangle {
            x: parent.width - 220; y: 8; width: 200; height: 28; radius: 8
            color: root.isDark ? "#20212e" : "#e9ebf3"
            Image { x: 8; anchors.verticalCenter: parent.verticalCenter; width: 16; height: 16
                    source: root.breeze("actions/22/edit-find.svg") }
            Text { x: 30; anchors.verticalCenter: parent.verticalCenter; text: "검색"; color: root.sub; font.pixelSize: 13 }
        }
        // sidebar
        Column {
            x: 10; y: 54; width: 190; spacing: 2
            Text { leftPadding: 10; text: "위치"; color: root.sub; font.pixelSize: 11; font.weight: Font.DemiBold; bottomPadding: 4 }
            Repeater {
                model: [["user-home", "홈"], ["user-desktop", "데스크톱"], ["folder-documents", "문서"],
                        ["folder-download", "다운로드"], ["folder-pictures", "사진"], ["folder-music", "음악"],
                        ["folder-videos", "동영상"], ["user-trash", "휴지통"]]
                Rectangle {
                    width: 190; height: 30; radius: 7
                    color: index === 0 ? Qt.rgba(0.39, 0.4, 0.95, root.isDark ? 0.28 : 0.14) : "transparent"
                    Image { x: 10; anchors.verticalCenter: parent.verticalCenter; width: 20; height: 20
                            sourceSize: Qt.size(40, 40); source: root.icon("places", modelData[0]) }
                    Text { x: 38; anchors.verticalCenter: parent.verticalCenter; text: modelData[1]
                           color: root.fg; font.pixelSize: 13 }
                }
            }
            Item { width: 1; height: 10 }
            Text { leftPadding: 10; text: "장치"; color: root.sub; font.pixelSize: 11; font.weight: Font.DemiBold; bottomPadding: 4 }
            Repeater {
                model: [["drive-harddisk", "내장 디스크"], ["drive-removable-media-usb", "USB 메모리"]]
                Item {
                    width: 190; height: 30
                    Image { x: 10; anchors.verticalCenter: parent.verticalCenter; width: 20; height: 20
                            sourceSize: Qt.size(40, 40); source: root.icon("devices", modelData[0]) }
                    Text { x: 38; anchors.verticalCenter: parent.verticalCenter; text: modelData[1]
                           color: root.fg; font.pixelSize: 13 }
                }
            }
        }
        // content
        Rectangle {
            x: 210; y: 46; width: parent.width - 210; height: parent.height - 46 - 26
            color: root.view
            Grid {
                x: 30; y: 26; columns: 6; columnSpacing: 34; rowSpacing: 22
                Repeater {
                    model: [["user-desktop", "데스크톱"], ["folder-documents", "문서"], ["folder-download", "다운로드"],
                            ["folder-pictures", "사진"], ["folder-music", "음악"], ["folder-videos", "동영상"],
                            ["folder-templates", "템플릿"], ["folder-public", "공유"], ["folder", "프로젝트"]]
                    Column {
                        width: 100; spacing: 6
                        Image { anchors.horizontalCenter: parent.horizontalCenter; width: 72; height: 72
                                sourceSize: Qt.size(144, 144); source: root.icon("places", modelData[0]) }
                        Text { anchors.horizontalCenter: parent.horizontalCenter; text: modelData[1]
                               color: root.fg; font.pixelSize: 13 }
                    }
                }
            }
        }
        Text { x: 222; y: parent.height - 21; text: "폴더 9개"; color: root.sub; font.pixelSize: 12 }
    }

    // ------------------------------------------------------------ top bar
    KSvg.FrameSvgItem {
        id: bar
        width: parent.width; height: 28
        imagePath: root.plasma + "translucent/widgets/panel-background.svg"
        enabledBorders: KSvg.FrameSvg.BottomBorder
        Image { x: 12; anchors.verticalCenter: parent.verticalCenter; width: 18; height: 18
                sourceSize: Qt.size(36, 36); source: root.icon("apps", "start-here") }
        Row {
            x: 44; anchors.verticalCenter: parent.verticalCenter; spacing: 20
            Text { text: "파일"; font.pixelSize: 13; font.weight: Font.Bold; color: root.fg }
            Repeater {
                model: ["편집", "보기", "이동", "도구", "설정", "도움말"]
                Text { text: modelData; font.pixelSize: 13; color: root.fg }
            }
        }
        Row {
            anchors.right: parent.right; anchors.rightMargin: 14
            anchors.verticalCenter: parent.verticalCenter; spacing: 14
            Text { text: "한"; font.pixelSize: 13; font.weight: Font.Bold; color: "#6366f1"
                   anchors.verticalCenter: parent.verticalCenter }
            Repeater {
                model: ["status/22/network-wireless-signal-good-symbolic.svg", "status/22/audio-volume-high-symbolic.svg",
                        "status/22/battery-080-symbolic.svg"]
                Image { width: 16; height: 16; source: root.breeze(modelData); anchors.verticalCenter: parent.verticalCenter }
            }
            Text { text: "11월 14일 (토)  오전 10:24"; font.pixelSize: 13; color: root.fg
                   anchors.verticalCenter: parent.verticalCenter }
        }
    }

    // ------------------------------------------------------------ dock
    Item {
        id: dock
        readonly property var apps: [
            ["apps", "system-file-manager", "focus"], ["sys", "/usr/share/icons/hicolor/256x256/apps/firefox.png", "normal"],
            ["apps", "nuri-assistant", "normal"], ["apps", "utilities-terminal", "minimized"],
            ["apps", "plasma-discover", ""], ["apps", "preferences-system", ""],
            ["apps", "nuri-welcome", ""]
        ]
        readonly property int slot: 56
        width: apps.length * slot + 12 + slot + 16
        height: 64
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 10

        KSvg.FrameSvgItem {
            anchors.fill: parent; anchors.margins: -18
            imagePath: root.plasma + "translucent/widgets/panel-background.svg"
            prefix: "shadow"
        }
        KSvg.FrameSvgItem {
            anchors.fill: parent
            imagePath: root.plasma + "translucent/widgets/panel-background.svg"
        }
        Row {
            x: 8; y: 4
            Repeater {
                model: dock.apps
                Item {
                    width: dock.slot; height: 56
                    KSvg.FrameSvgItem {
                        anchors.fill: parent
                        visible: modelData[2] !== ""
                        imagePath: root.plasma + "widgets/tasks.svg"
                        prefix: modelData[2] || "normal"
                    }
                    Image {
                        x: 6; y: 3; width: 44; height: 44
                        sourceSize: Qt.size(88, 88)
                        source: modelData[0] === "sys" ? "file://" + modelData[1] : root.icon(modelData[0], modelData[1])
                    }
                }
            }
            Item {
                width: 12; height: 56
                Rectangle { anchors.centerIn: parent; width: 1; height: 34; color: root.isDark ? "#40ffffff" : "#26000000" }
            }
            Item {
                width: dock.slot; height: 56
                Image { x: 6; y: 3; width: 44; height: 44; sourceSize: Qt.size(88, 88); source: root.icon("places", "user-trash") }
            }
        }
    }
}
