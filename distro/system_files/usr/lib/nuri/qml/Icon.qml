// Line icon on a 24x24 grid, tinted by `color`, drawn as an SVG image.
// (An Image, not a Shape: images are clipped correctly by every scene-graph
// renderer, including the software one used without a GPU.)
// All icons are original simple geometry (no third-party icon set).
import QtQuick

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
        "warn": "M12 4l9 15.5H3z M12 10v4 M12 17h.01",
        "wifi": "M4.5 9.5a11 11 0 0 1 15 0 M7.5 12.8a6.5 6.5 0 0 1 9 0 M10.5 16a2.2 2.2 0 0 1 3 0 M12 19h.01",
        "bluetooth": "M7 7.5l10 9-5 4.5v-18l5 4.5-10 9",
        "share": "M12 15V4 M8 7.5L12 3.5l4 4 M6 12v6.5h12V12",
        "moon": "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z",
        "bell": "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z M10 20.5h4",
        "belloff": "M6 16.5V11a6 6 0 0 1 9.3-5 M18 10.5v6l1.5 1.5h-15 M10 20.5h4 M4 4l16 16",
        "sun": "M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4",
        "speaker": "M4.5 9.5h3.5l4.5-4v13l-4.5-4H4.5z M16 9a4 4 0 0 1 0 6 M18.5 6.5a7.5 7.5 0 0 1 0 11",
        "camera": "M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4z M12 10.5a3.2 3.2 0 1 1 0 6.4a3.2 3.2 0 1 1 0-6.4z",
        "gear": "M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1",
        "battery": "M4 8h14v8H4z M20 10.5v3",
        "info": "M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17z M12 11v5.5 M12 7.8h.01",
        "contrast": "M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17z M12 3.5v17 M12 7h4 M12 11h6 M12 15h5",
        "leaf": "M5 19c0-8 5-13 14-14 0 9-5 14-13 14z M5 19l7-7",
        "scale": "M12 4v16 M5 8h14 M5 8l-2.5 6a2.5 2.5 0 0 0 5 0z M19 8l-2.5 6a2.5 2.5 0 0 0 5 0z M8 20h8",
        "memory": "M4 7h16v10H4z M8 7v10 M12 7v10 M16 7v10 M6 17v2.5 M18 17v2.5",
        "disk": "M4 6h16v12H4z M4 13h16 M16.5 15.5h.01"
    })

    function hex(c) {
        function h(v) { var s = Math.round(v * 255).toString(16); return s.length < 2 ? "0" + s : s }
        return "#" + h(c.r) + h(c.g) + h(c.b)
    }

    Image {
        anchors.fill: parent
        smooth: true
        mipmap: true
        sourceSize.width: Math.ceil(root.size * 2)
        sourceSize.height: Math.ceil(root.size * 2)
        visible: !!root.paths[root.name]
        source: !root.paths[root.name] ? "" : "data:image/svg+xml;utf8," + encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>"
            + "<path d='" + (root.paths[root.name] || "") + "' "
            + (root.filled
               ? "fill='" + root.hex(root.color) + "' fill-opacity='" + root.color.a + "' stroke='none'"
               : "fill='none' stroke='" + root.hex(root.color) + "' stroke-opacity='" + root.color.a
                 + "' stroke-width='" + root.stroke + "' stroke-linecap='round' stroke-linejoin='round'")
            + "/></svg>")
    }
}
