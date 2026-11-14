// Round, borderless icon button with a hover halo and a tooltip-like label.
import QtQuick

Rectangle {
    id: root
    property string icon
    property var theme
    property real iconSize: 18
    signal clicked()

    width: 34
    height: 34
    radius: 17
    color: mouse.containsMouse ? theme.hover : "transparent"
    scale: mouse.pressed ? 0.92 : 1
    Behavior on color { ColorAnimation { duration: 120 } }
    Behavior on scale { NumberAnimation { duration: 90 } }

    Icon {
        anchors.centerIn: parent
        name: root.icon
        size: root.iconSize
        color: root.theme.sub
    }
    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.clicked()
    }
}
