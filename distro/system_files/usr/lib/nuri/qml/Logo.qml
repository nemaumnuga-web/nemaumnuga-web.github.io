// The Nuri mark: a four-point spark (with a small companion star) on a
// gradient tile. `plate: false` draws only the spark, for dark backgrounds.
import QtQuick
import QtQuick.Shapes

Item {
    id: root
    property real size: 32
    property bool plate: true
    property color sparkColor: "white"
    width: size
    height: size

    Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        transform: Scale { xScale: root.size / 128; yScale: root.size / 128 }

        ShapePath {   // tile
            strokeColor: "transparent"
            fillGradient: LinearGradient {
                x1: 8; y1: 8; x2: 120; y2: 120
                GradientStop { position: 0.0; color: root.plate ? "#6d7bff" : "transparent" }
                GradientStop { position: 0.55; color: root.plate ? "#8f5cf6" : "transparent" }
                GradientStop { position: 1.0; color: root.plate ? "#e46fb3" : "transparent" }
            }
            PathSvg { path: "M38 8H90A30 30 0 0 1 120 38V90A30 30 0 0 1 90 120H38A30 30 0 0 1 8 90V38A30 30 0 0 1 38 8Z" }
        }
        ShapePath {   // soft top highlight
            strokeColor: "transparent"
            fillGradient: LinearGradient {
                x1: 64; y1: 8; x2: 64; y2: 70
                GradientStop { position: 0.0; color: root.plate ? Qt.rgba(1, 1, 1, 0.28) : "transparent" }
                GradientStop { position: 1.0; color: "transparent" }
            }
            PathSvg { path: "M38 8H90A30 30 0 0 1 120 38V64H8V38A30 30 0 0 1 38 8Z" }
        }
        ShapePath {   // main spark
            strokeColor: "transparent"
            fillColor: root.sparkColor
            PathSvg { path: "M64 26C67 50 78 61 102 64C78 67 67 78 64 102C61 78 50 67 26 64C50 61 61 50 64 26Z" }
        }
        ShapePath {   // companion star
            strokeColor: "transparent"
            fillColor: Qt.rgba(root.sparkColor.r, root.sparkColor.g, root.sparkColor.b, 0.85)
            PathSvg { path: "M93 28C94 35 97 38 104 39C97 40 94 43 93 50C92 43 89 40 82 39C89 38 92 35 93 28Z" }
        }
    }
}
