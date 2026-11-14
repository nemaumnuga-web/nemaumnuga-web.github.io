// Nuri OS login splash (shown by ksplashqml between login and the desktop).
// ksplashqml sets `stage` from 1 to 6 as the session starts.
// Plain QtQuick + Shapes only, so it also renders in tests and previews.
import QtQuick

Rectangle {
    id: root
    property int stage: 0
    color: "#0e0f1d"

    onStageChanged: {
        if (stage >= 2) content.opacity = 1
    }

    // Night-sky gradient matching the dark wallpaper
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#121433" }
            GradientStop { position: 0.55; color: "#17112f" }
            GradientStop { position: 1.0; color: "#0b0c18" }
        }
    }

    // Soft glow behind the mark: concentric translucent discs
    Repeater {
        model: 28
        Rectangle {
            readonly property real d: 120 + index * 17
            width: d
            height: d
            radius: d / 2
            x: (root.width - d) / 2
            y: root.height * 0.44 - d / 2
            color: Qt.rgba(0.48, 0.38, 0.98, 0.011)
        }
    }

    Item {
        id: content
        anchors.fill: parent
        opacity: 0
        Behavior on opacity { NumberAnimation { duration: 700; easing.type: Easing.InOutQuad } }

        Logo {
            id: mark
            size: Math.round(Math.min(root.width, root.height) * 0.11)
            x: (root.width - width) / 2
            y: root.height * 0.44 - height / 2
            transformOrigin: Item.Center
            SequentialAnimation on scale {
                loops: Animation.Infinite
                NumberAnimation { from: 1.0; to: 1.045; duration: 1400; easing.type: Easing.InOutSine }
                NumberAnimation { from: 1.045; to: 1.0; duration: 1400; easing.type: Easing.InOutSine }
            }
        }

        Text {
            id: word
            anchors.horizontalCenter: parent.horizontalCenter
            y: mark.y + mark.height + mark.height * 0.32
            text: "Nuri"
            color: "#f3f2ff"
            font.pixelSize: Math.round(mark.size * 0.34)
            font.weight: Font.DemiBold
            font.letterSpacing: Math.round(mark.size * 0.34) * 0.12
        }

        // Progress follows the session start-up stages.
        Rectangle {
            id: track
            width: Math.round(mark.size * 1.6)
            height: 4
            radius: 2
            anchors.horizontalCenter: parent.horizontalCenter
            y: word.y + word.height + mark.size * 0.36
            color: Qt.rgba(1, 1, 1, 0.10)
            Rectangle {
                height: parent.height
                radius: parent.radius
                width: parent.width * Math.min(1, Math.max(0.08, root.stage / 6))
                Behavior on width { NumberAnimation { duration: 500; easing.type: Easing.OutCubic } }
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: "#6d7bff" }
                    GradientStop { position: 0.55; color: "#8f5cf6" }
                    GradientStop { position: 1; color: "#e46fb3" }
                }
            }
        }
    }

    Text {
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 28
        anchors.horizontalCenter: parent.horizontalCenter
        text: "Nuri OS · on-device AI"
        color: Qt.rgba(1, 1, 1, 0.38)
        font.pixelSize: 13
        opacity: content.opacity
    }
}
