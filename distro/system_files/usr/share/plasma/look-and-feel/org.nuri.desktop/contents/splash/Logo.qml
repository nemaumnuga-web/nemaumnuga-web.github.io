// The Nuri mark: a four-point spark (with a small companion star) on a
// gradient tile, drawn as an SVG image (clipped correctly by every renderer).
// `plate: false` draws only the spark, for dark backgrounds.
import QtQuick

Item {
    id: root
    property real size: 32
    property bool plate: true
    width: size
    height: size

    readonly property string svg:
        "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'><defs>"
        + "<linearGradient id='t' x1='8' y1='8' x2='120' y2='120' gradientUnits='userSpaceOnUse'>"
        + "<stop offset='0' stop-color='#6d7bff'/><stop offset='0.55' stop-color='#8f5cf6'/>"
        + "<stop offset='1' stop-color='#e46fb3'/></linearGradient>"
        + "<linearGradient id='s' x1='64' y1='8' x2='64' y2='70' gradientUnits='userSpaceOnUse'>"
        + "<stop offset='0' stop-color='#ffffff' stop-opacity='0.28'/>"
        + "<stop offset='1' stop-color='#ffffff' stop-opacity='0'/></linearGradient></defs>"
        + (root.plate
           ? "<path d='M38 8H90A30 30 0 0 1 120 38V90A30 30 0 0 1 90 120H38A30 30 0 0 1 8 90V38A30 30 0 0 1 38 8Z' fill='url(#t)'/>"
             + "<path d='M38 8H90A30 30 0 0 1 120 38V64H8V38A30 30 0 0 1 38 8Z' fill='url(#s)'/>"
           : "")
        + "<path d='M64 26C67 50 78 61 102 64C78 67 67 78 64 102C61 78 50 67 26 64C50 61 61 50 64 26Z' fill='#ffffff'/>"
        + "<path d='M93 28C94 35 97 38 104 39C97 40 94 43 93 50C92 43 89 40 82 39C89 38 92 35 93 28Z' fill='#ffffff' fill-opacity='0.85'/>"
        + "</svg>"

    Image {
        anchors.fill: parent
        smooth: true
        mipmap: true
        sourceSize.width: Math.ceil(root.size * 2)
        sourceSize.height: Math.ceil(root.size * 2)
        source: "data:image/svg+xml;utf8," + encodeURIComponent(root.svg)
    }
}
