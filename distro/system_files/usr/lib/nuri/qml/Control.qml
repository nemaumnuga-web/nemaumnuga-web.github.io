// Nuri Control Center: quick settings in rounded tiles, live system status.
import QtQuick
import QtQuick.Controls.Basic

Window {
    id: win
    width: 420
    height: 720
    visible: false
    color: "transparent"
    flags: Qt.Window | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    title: bridge.t.title

    QtObject {
        id: ui
        property bool dark: bridge.state.dark
        property color card: dark ? "#ee17181f" : "#f2f8f8fc"
        property color tile: dark ? "#2a2c38" : "#ffffff"
        property color tileOff: dark ? "#22242e" : "#eceef5"
        property color surface: dark ? "#1c1e28" : "#ffffff"
        property color hover: dark ? "#2a2d3d" : "#eef0fb"
        property color border: dark ? "#33ffffff" : "#14000000"
        property color text: dark ? "#ececf4" : "#16171f"
        property color sub: dark ? "#9497ab" : "#6a6d80"
        property color accent: "#6366f1"
        Behavior on card { ColorAnimation { duration: 250 } }
    }

    // ---------------------------------------------------------- pieces
    component Round: Rectangle {
        property string icon
        property bool on
        width: 38; height: 38; radius: 19
        color: on ? ui.accent : (ui.dark ? "#3a3d4c" : "#e3e5ee")
        Behavior on color { ColorAnimation { duration: 160 } }
        Icon { anchors.centerIn: parent; name: parent.icon; size: 19; color: parent.on ? "white" : ui.text }
    }
    component Toggle: Rectangle {
        id: tg
        property string key
        property string icon
        property string label
        readonly property bool on: !!bridge.state[key]
        height: 64; radius: 18
        color: m.containsMouse ? ui.hover : ui.tile
        Behavior on color { ColorAnimation { duration: 120 } }
        Round { id: rd; x: 12; anchors.verticalCenter: parent.verticalCenter; icon: tg.icon; on: tg.on }
        Column {
            anchors.left: rd.right; anchors.leftMargin: 10; anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            Text { text: tg.label; color: ui.text; font.pixelSize: 13; font.weight: Font.DemiBold
                   elide: Text.ElideRight; width: parent.width - 8 }
            Text { text: tg.on ? bridge.t.on : bridge.t.off; color: ui.sub; font.pixelSize: 11 }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                    onClicked: bridge.toggle(tg.key, !tg.on) }
    }
    component SliderTile: Rectangle {
        id: st
        property string label
        property string icon
        property int value
        signal moved(int v)
        height: 74; radius: 18; color: ui.tile
        Text { x: 16; y: 12; text: st.label; color: ui.text; font.pixelSize: 13; font.weight: Font.DemiBold }
        Rectangle {
            id: track
            x: 14; y: 38; width: parent.width - 28; height: 24; radius: 12
            color: ui.tileOff
            Rectangle {
                width: Math.max(height, parent.width * st.value / 100); height: parent.height; radius: 12
                color: ui.dark ? "#ececf4" : "#ffffff"
                border.color: ui.dark ? "transparent" : "#1a000000"
                Behavior on width { NumberAnimation { duration: 90 } }
            }
            Icon { x: 6; anchors.verticalCenter: parent.verticalCenter; name: st.icon; size: 14; color: "#6a6d80" }
            MouseArea {
                anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                function set(mx) { st.moved(Math.round(Math.max(0, Math.min(1, mx / width)) * 100)) }
                onPressed: (e) => set(e.x)
                onPositionChanged: (e) => { if (pressed) set(e.x) }
            }
        }
    }
    component Action: Column {
        property string icon
        property string label
        property string what
        spacing: 6
        width: 76
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            width: 52; height: 52; radius: 16
            color: am.containsMouse ? ui.hover : ui.tile
            Icon { anchors.centerIn: parent; name: parent.parent.icon; size: 22; color: ui.text }
            MouseArea { id: am; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                        onClicked: bridge.launch(parent.parent.what) }
        }
        Text { anchors.horizontalCenter: parent.horizontalCenter; text: parent.label
               color: ui.text; font.pixelSize: 11 }
    }

    component Gauge: Column {
        property string label
        property string value
        property real frac
        spacing: 4
        width: 100
        Text { text: parent.label; color: ui.sub; font.pixelSize: 11 }
        Text { text: parent.value; color: ui.text; font.pixelSize: 13; font.weight: Font.DemiBold
               elide: Text.ElideRight; width: parent.width }
        Rectangle {
            width: parent.width; height: 5; radius: 2.5; color: ui.tileOff
            visible: parent.frac >= 0
            Rectangle { width: parent.width * Math.max(0, parent.parent.frac); height: 5; radius: 2.5
                        color: parent.parent.frac > 0.85 ? "#f97316" : ui.accent
                        Behavior on width { NumberAnimation { duration: 400 } } }
        }
    }

    // soft shadow
    Repeater {
        model: 14
        Rectangle {
            x: 20 - index; y: 22 - index * 0.6
            width: win.width - 40 + index * 2; height: win.height - 40 + index * 2
            radius: 28 + index
            color: "transparent"
            border.width: 1
            border.color: Qt.rgba(0.04, 0.05, 0.12, 0.022 * (14 - index) / 14 * 2)
        }
    }

    Rectangle {
        id: card
        anchors.fill: parent
        anchors.margins: 20
        radius: 28
        color: ui.card
        border.color: ui.border

        Column {
            x: 16; y: 16
            width: parent.width - 32
            spacing: 10

            // network group + appearance column
            Row {
                spacing: 10
                Rectangle {
                    width: (parent.parent.width - 10) / 2; height: 202; radius: 20; color: ui.tile
                    Column {
                        x: 14; y: 14; spacing: 14
                        Repeater {
                            model: [["wifi", "wifi", bridge.t.wifi], ["bluetooth", "bluetooth", bridge.t.bluetooth],
                                    ["share", "share", bridge.t.share]]
                            Row {
                                spacing: 10
                                Round {
                                    icon: modelData[1]; on: !!bridge.state[modelData[0]]
                                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                                                onClicked: bridge.toggle(modelData[0], !bridge.state[modelData[0]]) }
                                }
                                Column {
                                    anchors.verticalCenter: parent.verticalCenter
                                    Text { text: modelData[2]; color: ui.text; font.pixelSize: 13; font.weight: Font.DemiBold }
                                    Text { text: bridge.state[modelData[0]] ? bridge.t.on : bridge.t.off
                                           color: ui.sub; font.pixelSize: 11 }
                                }
                            }
                        }
                    }
                }
                Column {
                    spacing: 10
                    width: (parent.parent.width - 10) / 2
                    Toggle { width: parent.width; key: "dark"; icon: "contrast"; label: bridge.t.dark }
                    Toggle { width: parent.width; key: "dnd"; icon: "moon"; label: bridge.t.dnd }
                    Toggle { width: parent.width; key: "night"; icon: "sun"; label: bridge.t.night }
                }
            }

            // power mode
            Rectangle {
                width: parent.width; height: 74; radius: 18; color: ui.tile
                Text { x: 16; y: 12; text: bridge.t.power; color: ui.text; font.pixelSize: 13; font.weight: Font.DemiBold }
                Row {
                    x: 12; y: 36; spacing: 6
                    Repeater {
                        model: [["power-saver", "leaf", bridge.t.saver], ["balanced", "scale", bridge.t.balanced],
                                ["performance", "bolt", bridge.t.performance]]
                        Rectangle {
                            readonly property bool on: bridge.state.power === modelData[0]
                            width: (card.width - 32 - 24 - 12) / 3; height: 28; radius: 9
                            color: on ? ui.accent : ui.tileOff
                            Row {
                                anchors.centerIn: parent; spacing: 5
                                Icon { name: modelData[1]; size: 14; color: parent.parent.on ? "white" : ui.text
                                       anchors.verticalCenter: parent.verticalCenter }
                                Text { text: modelData[2]; font.pixelSize: 12; color: parent.parent.on ? "white" : ui.text
                                       anchors.verticalCenter: parent.verticalCenter }
                            }
                            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                                        onClicked: bridge.setPower(modelData[0]) }
                        }
                    }
                }
            }

            SliderTile { width: parent.width; label: bridge.t.display; icon: "sun"; value: bridge.state.brightness
                         onMoved: (v) => bridge.setBrightness(v) }
            SliderTile { width: parent.width; label: bridge.t.sound; icon: "speaker"; value: bridge.state.volume
                         onMoved: (v) => bridge.setVolume(v) }

            // quick actions
            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: 12
                Action { icon: "spark"; label: bridge.t.ai; what: "assistant" }
                Action { icon: "camera"; label: bridge.t.shot; what: "screenshot" }
                Action { icon: "lock"; label: bridge.t.lock; what: "lock" }
                Action { icon: "gear"; label: bridge.t.settings; what: "settings" }
            }

            // live status
            Rectangle {
                width: parent.width; height: 74; radius: 18; color: ui.tile
                Row {
                    anchors.centerIn: parent
                    spacing: 18
                    Gauge { label: bridge.t.cpu; value: bridge.stats.cpu + "%"; frac: bridge.stats.cpu / 100 }
                    Gauge { label: bridge.t.memory; value: bridge.stats.ram_used + " / " + bridge.stats.ram_total + " GB"
                            frac: bridge.stats.ram_frac }
                    Gauge {
                        label: bridge.stats.battery >= 0 ? bridge.t.battery : bridge.t.model
                        value: bridge.stats.battery >= 0
                               ? bridge.stats.battery + "%" + (bridge.stats.charging ? " ⚡" : "")
                               : (bridge.stats.model || bridge.t.no_model)
                        frac: bridge.stats.battery >= 0 ? bridge.stats.battery / 100 : -1
                    }
                }
            }
        }
    }

    Shortcut { sequence: "Esc"; onActivated: Qt.quit() }
}
