// Rounded button: `primary` uses the brand gradient, otherwise a quiet outline.
import QtQuick

Rectangle {
    id: root
    property alias text: label.text
    property string icon: ""
    property bool primary: false
    property bool compact: false
    property var theme
    signal clicked()

    implicitHeight: compact ? 30 : 36
    implicitWidth: row.implicitWidth + (compact ? 22 : 30)
    radius: height / 2
    color: primary ? "transparent" : (mouse.containsMouse && enabled ? theme.hover : theme.surface)
    border.width: primary ? 0 : 1
    border.color: theme.border
    opacity: enabled ? 1 : 0.45
    scale: mouse.pressed && enabled ? 0.96 : 1
    Behavior on scale { NumberAnimation { duration: 90 } }
    Behavior on color { ColorAnimation { duration: 120 } }

    Rectangle {
        anchors.fill: parent
        radius: parent.radius
        visible: root.primary
        gradient: Gradient {
            orientation: Gradient.Horizontal
            GradientStop { position: 0; color: mouse.containsMouse ? "#5b5ef0" : "#6366f1" }
            GradientStop { position: 1; color: mouse.containsMouse ? "#9649f0" : "#a855f7" }
        }
    }

    Row {
        id: row
        anchors.centerIn: parent
        spacing: 6
        Icon {
            visible: root.icon !== ""
            name: root.icon
            size: root.compact ? 14 : 16
            color: root.primary ? "white" : root.theme.text
            anchors.verticalCenter: parent.verticalCenter
        }
        Text {
            id: label
            color: root.primary ? "white" : root.theme.text
            font.pixelSize: root.compact ? 12 : 13
            font.weight: Font.DemiBold
            anchors.verticalCenter: parent.verticalCenter
        }
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: root.enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: if (root.enabled) root.clicked()
    }
}
