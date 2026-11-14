// Line icon drawn from an SVG path on a 24x24 grid, tinted by `color`.
// All icons are original simple geometry (no third-party icon set).
import QtQuick
import QtQuick.Shapes

Item {
    id: root
    property string name
    property color color: "black"
    property real size: 20
    property real stroke: 1.9
    property bool filled: false
    width: size
    height: size

    readonly property var paths: ({
        "send": "M12 19V6 M6 11.5l6-6 6 6",
        "plus": "M12 5v14 M5 12h14",
        "pencil": "M4.5 19.5l3.8-.9L19 7.9 16.1 5 5.4 15.7z M14 7.1l2.9 2.9",
        "grid": "M5 4.5h5a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z M14 4.5h5a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z M5 13.5h5a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5v-5a.5.5 0 0 1 .5-.5z M14 13.5h5a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-5a.5.5 0 0 1 .5-.5z",
        "back": "M14.5 18l-6-6 6-6",
        "check": "M5 12.5l4.5 4.5L19 7.5",
        "lock": "M6.5 11h11v8.5h-11z M9 11V8.5a3 3 0 0 1 6 0V11",
        "window": "M3.5 5.5h17v13h-17z M3.5 9.5h17 M6.5 7.5h.01 M9 7.5h.01",
        "doc": "M7 3.5h7l4 4V20.5H7z M14 3.5v4h4 M9.5 13h6 M9.5 16.5h6",
        "globe": "M20.5 12a8.5 8.5 0 1 1-17 0a8.5 8.5 0 1 1 17 0z M3.5 12h17 M12 3.5c2.8 3 2.8 14 0 17 M12 3.5c-2.8 3-2.8 14 0 17",
        "bolt": "M13 3.5L6 13.5h5.5l-1 7 7-10H12z",
        "download": "M12 4.5v10 M7.5 10.5L12 15l4.5-4.5 M5.5 19.5h13",
        "search": "M15.5 10.5a5 5 0 1 1-10 0a5 5 0 1 1 10 0z M14.2 14.2L19.5 19.5",
        "close": "M6.5 6.5l11 11 M17.5 6.5l-11 11",
        "chip": "M7 7h10v10H7z M9.5 4v3 M14.5 4v3 M9.5 17v3 M14.5 17v3 M4 9.5h3 M4 14.5h3 M17 9.5h3 M17 14.5h3",
        "spark": "M12 3c.6 4.6 2.4 6.4 7 7c-4.6.6-6.4 2.4-7 7c-.6-4.6-2.4-6.4-7-7c4.6-.6 6.4-2.4 7-7z",
        "copy": "M9 8.5h10.5V20H9z M15 5.5V4H4.5v11.5H6",
        "warn": "M12 4l9 15.5H3z M12 10v4 M12 17h.01"
    })

    Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        transform: Scale { xScale: root.size / 24; yScale: root.size / 24 }
        ShapePath {
            strokeColor: root.filled ? "transparent" : root.color
            strokeWidth: root.stroke
            fillColor: root.filled ? root.color : "transparent"
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { path: root.paths[root.name] || "" }
        }
    }
}
