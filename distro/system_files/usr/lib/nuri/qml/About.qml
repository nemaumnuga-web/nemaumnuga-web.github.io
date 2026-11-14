// "About this computer": the OS, the hardware and the AI model at a glance.
import QtQuick
import QtQuick.Controls.Basic

Window {
    id: win
    width: 560
    height: 690
    minimumWidth: 480
    minimumHeight: 650
    visible: false
    title: bridge.t.about_title
    color: ui.card

    QtObject {
        id: ui
        property bool dark: bridge.dark
        property color card: dark ? "#14151d" : "#fbfbfe"
        property color surface: dark ? "#1c1e28" : "#ffffff"
        property color surface2: dark ? "#242735" : "#eef0f6"
        property color hover: dark ? "#2a2d3d" : "#eef0fb"
        property color border: dark ? "#2b2e3d" : "#e4e6f0"
        property color text: dark ? "#ececf4" : "#16171f"
        property color sub: dark ? "#9497ab" : "#6a6d80"
        property color accent: "#6366f1"
    }

    Rectangle {
        width: parent.width; height: 260
        gradient: Gradient {
            GradientStop { position: 0; color: Qt.rgba(0.43, 0.48, 1, ui.dark ? 0.22 : 0.16) }
            GradientStop { position: 1; color: "transparent" }
        }
    }

    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        y: 40
        width: parent.width - 80
        spacing: 22

        Logo { size: 108; anchors.horizontalCenter: parent.horizontalCenter }
        Column {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 4
            Text { anchors.horizontalCenter: parent.horizontalCenter; text: bridge.info.name
                   font.pixelSize: 30; font.weight: Font.Bold; color: ui.text }
            Text { anchors.horizontalCenter: parent.horizontalCenter
                   text: (bridge.info.version ? bridge.info.version + " · " : "") + bridge.t.base + " " + bridge.info.base
                   font.pixelSize: 13; color: ui.sub }
        }

        Rectangle {
            width: parent.width; height: rows.height + 16; radius: 16
            color: ui.surface; border.color: ui.border
            Column {
                id: rows
                y: 8; width: parent.width
                Repeater {
                    model: [["chip", bridge.t.chip, bridge.info.cpu + "  ·  " + bridge.info.cores],
                            ["memory", bridge.t.memory, bridge.info.memory],
                            ["window", bridge.t.graphics, bridge.info.gpu],
                            ["spark", bridge.t.model, (bridge.stats.model || bridge.t.no_model) + "  ·  " + bridge.t.local]]
                    Item {
                        width: rows.width; height: 46
                        Rectangle { visible: index > 0; x: 50; width: parent.width - 66; height: 1; color: ui.border }
                        Icon { x: 18; anchors.verticalCenter: parent.verticalCenter; name: modelData[0]; size: 18; color: ui.accent }
                        Text { x: 50; anchors.verticalCenter: parent.verticalCenter; text: modelData[1]
                               color: ui.sub; font.pixelSize: 13; width: 90 }
                        Text { x: 150; anchors.verticalCenter: parent.verticalCenter; width: parent.width - 166
                               text: modelData[2]; color: ui.text; font.pixelSize: 13; font.weight: Font.DemiBold
                               elide: Text.ElideRight; horizontalAlignment: Text.AlignRight }
                    }
                }
            }
        }

        // storage bar
        Rectangle {
            width: parent.width; height: 84; radius: 16; color: ui.surface; border.color: ui.border
            Icon { x: 18; y: 16; name: "disk"; size: 18; color: ui.accent }
            Text { x: 50; y: 16; text: bridge.t.storage; color: ui.sub; font.pixelSize: 13 }
            Text { anchors.right: parent.right; anchors.rightMargin: 16; y: 16
                   text: bridge.info.disk_total; color: ui.text; font.pixelSize: 13; font.weight: Font.DemiBold }
            Rectangle {
                x: 18; y: 44; width: parent.width - 36; height: 10; radius: 5; color: ui.surface2
                Rectangle {
                    width: parent.width * bridge.info.disk_frac; height: parent.height; radius: 5
                    gradient: Gradient {
                        orientation: Gradient.Horizontal
                        GradientStop { position: 0; color: "#6366f1" }
                        GradientStop { position: 1; color: "#a855f7" }
                    }
                }
            }
            Text { x: 18; y: 60; text: bridge.info.disk_used; color: ui.sub; font.pixelSize: 11 }
            Text { anchors.right: parent.right; anchors.rightMargin: 18; y: 60
                   text: bridge.info.disk_free; color: ui.sub; font.pixelSize: 11 }
        }

        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 12
            PillButton { theme: ui; icon: "info"; text: bridge.t.more; onClicked: bridge.launch("sysinfo") }
            PillButton { theme: ui; primary: true; icon: "download"; text: bridge.t.update
                         onClicked: bridge.launch("updates") }
        }
        Text { anchors.horizontalCenter: parent.horizontalCenter
               text: bridge.t.license + "  ·  " + bridge.info.uptime; color: ui.sub; font.pixelSize: 11 }
    }
}
