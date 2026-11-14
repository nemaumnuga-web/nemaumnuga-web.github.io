// Nuri menu: a rounded pop-up menu with icons, shortcut hints and touch-sized rows.
import QtQuick

Window {
    id: win
    readonly property int pad: 14                      // room for the shadow
    readonly property int menuW: 272
    readonly property int rowH: 36
    readonly property int sepH: 11
    property int hovered: -1
    property bool closeOnBlur: true
    readonly property real menuH: {
        let h = 12
        for (let i = 0; i < bridge.items.length; i++)
            h += bridge.items[i].sep ? sepH : rowH
        return h
    }
    // desktop menu: the window manager centres the window on the pointer, so the
    // menu sits in the bottom-right quarter and its top-left corner is at the pointer
    width: bridge.logo ? menuW + 2 * pad : 2 * (menuW + pad)
    height: bridge.logo ? menuH + 2 * pad : 2 * (menuH + pad)
    color: "transparent"
    flags: Qt.Window | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    title: "Nuri"
    visible: false

    onActiveChanged: if (!active && closeOnBlur && opened.running === false && shown) Qt.quit()
    property bool shown: false
    Timer { id: opened; interval: 400; running: true; onTriggered: win.shown = true }

    QtObject {
        id: ui
        property bool dark: bridge.dark
        property color bg: dark ? "#f5262733" : "#f7f8f8fc"
        property color rim: dark ? "#26ffffff" : "#ffffffff"
        property color line: dark ? "#40000000" : "#1f000000"
        property color text: dark ? "#ececf4" : "#1c1d26"
        property color sub: dark ? "#8e91a6" : "#8b8d9c"
        property color sep: dark ? "#2effffff" : "#14000000"
        property color accent: "#6366f1"
    }

    // a click anywhere outside the menu closes it
    MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons; onClicked: Qt.quit() }

    Item {
        id: menu
        x: bridge.logo ? win.pad : win.menuW + win.pad
        y: bridge.logo ? win.pad : win.menuH + win.pad
        width: win.menuW
        height: win.menuH
        opacity: 0
        scale: 0.96
        transformOrigin: Item.TopLeft
        Component.onCompleted: { opacity = 1; scale = 1 }
        Behavior on opacity { NumberAnimation { duration: 120 } }
        Behavior on scale { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }

        // soft shadow
        Repeater {
            model: 10
            Rectangle {
                x: -index; y: -index + 4
                width: menu.width + 2 * index; height: menu.height + 2 * index
                radius: 13 + index
                color: "transparent"
                border.width: 1
                border.color: Qt.rgba(0.04, 0.05, 0.14, (ui.dark ? 0.09 : 0.05) * (10 - index) / 10)
            }
        }
        Rectangle {
            anchors.fill: parent
            radius: 13
            color: ui.bg
            border.color: ui.line
            Rectangle { anchors.fill: parent; anchors.margins: 1; radius: 12; color: "transparent"
                        border.color: ui.rim; opacity: 0.7 }
        }
        MouseArea { anchors.fill: parent }       // keep clicks between rows inside the menu

        Column {
            x: 6; y: 6
            width: parent.width - 12
            Repeater {
                model: bridge.items
                Item {
                    width: parent.width
                    height: modelData.sep ? win.sepH : win.rowH
                    readonly property bool hot: !modelData.sep && (rowMouse.containsMouse || win.hovered === index)
                    Rectangle {
                        visible: modelData.sep
                        x: 10; width: parent.width - 20; height: 1
                        anchors.verticalCenter: parent.verticalCenter
                        color: ui.sep
                    }
                    Rectangle {
                        visible: !modelData.sep
                        anchors.fill: parent
                        radius: 8
                        color: parent.hot ? ui.accent : "transparent"
                    }
                    Image {
                        visible: !modelData.sep
                        x: 10; anchors.verticalCenter: parent.verticalCenter
                        width: 22; height: 22; sourceSize: Qt.size(44, 44)
                        source: modelData.sep ? "" : modelData.icon
                    }
                    Text {
                        visible: !modelData.sep
                        x: 42; anchors.verticalCenter: parent.verticalCenter
                        text: modelData.sep ? "" : modelData.text
                        color: parent.hot ? "white" : ui.text
                        font.pixelSize: 14
                    }
                    Text {
                        visible: !modelData.sep && modelData.shortcut !== ""
                        anchors.right: parent.right; anchors.rightMargin: 12
                        anchors.verticalCenter: parent.verticalCenter
                        text: modelData.sep ? "" : modelData.shortcut
                        color: parent.hot ? "#d9daff" : ui.sub
                        font.pixelSize: 12
                    }
                    MouseArea {
                        id: rowMouse
                        anchors.fill: parent
                        enabled: !modelData.sep
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: bridge.pick(modelData.key)
                    }
                }
            }
        }
    }

    Shortcut { sequence: "Esc"; onActivated: Qt.quit() }
}
