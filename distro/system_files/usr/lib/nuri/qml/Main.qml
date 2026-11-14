// Nuri AI - main window: Spotlight-style chat panel + model library.
// Uses only QtQuick, QtQuick.Controls.Basic and QtQuick.Shapes, and no shader
// effects, so it renders the same on any GPU and with the software renderer.
import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts

Window {
    id: win
    objectName: "nuriWindow"
    width: 820
    height: 660
    minimumWidth: 600
    minimumHeight: 480
    visible: false
    color: "transparent"
    flags: Qt.Window | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    title: bridge.t.title

    property string page: "chat"
    property string libLang: bridge.lang
    property bool libAll: false
    property string libQuery: ""
    property var libModels: []
    property var progress: ({})
    property var dialogModel: null
    readonly property bool canSend: input.text.trim().length > 0 && !bridge.busy

    function reloadLibrary() { libModels = bridge.libraryModels(libLang, libAll, libQuery) }
    function openLibrary() { reloadLibrary(); page = "library" }
    function submit() {
        if (!canSend) return
        bridge.send(input.text)
        input.text = ""
    }
    function scrollToEnd() { Qt.callLater(chatList.positionViewAtEnd) }

    // ------------------------------------------------------------------ theme
    QtObject {
        id: ui
        property bool dark: bridge.dark
        property color card: dark ? "#14151d" : "#fbfbfe"
        property color surface: dark ? "#1c1e28" : "#ffffff"
        property color surface2: dark ? "#242735" : "#f2f3f9"
        property color bubble: dark ? "#1f2130" : "#f2f3fa"
        property color hover: dark ? "#2a2d3d" : "#eef0fb"
        property color border: dark ? "#2b2e3d" : "#e4e6f0"
        property color borderSoft: dark ? "#25283a" : "#eceef6"
        property color text: dark ? "#ececf4" : "#16171f"
        property color sub: dark ? "#9497ab" : "#6a6d80"
        property color accent: "#6366f1"
        property color accentSoft: dark ? Qt.rgba(0.39, 0.40, 0.95, 0.20) : Qt.rgba(0.39, 0.40, 0.95, 0.09)
        property color warn: dark ? "#fbbf24" : "#b45309"
        property color ok: dark ? "#4ade80" : "#15803d"
        property color okSoft: dark ? Qt.rgba(0.29, 0.87, 0.5, 0.14) : Qt.rgba(0.08, 0.5, 0.24, 0.09)
        property color danger: dark ? "#f87171" : "#dc2626"
    }

    // ------------------------------------------------------------------ bridge
    ListModel { id: msgs }

    Connections {
        target: bridge
        function onMessageAppended(role, text) {
            msgs.append({ role: role, text: text, pending: false })
            win.scrollToEnd()
        }
        function onBusyChanged() {
            if (bridge.busy && !(msgs.count && msgs.get(msgs.count - 1).pending)) {
                msgs.append({ role: "assistant", text: "", pending: true })
                win.scrollToEnd()
            }
        }
        function onStreamText(text) {
            if (msgs.count && msgs.get(msgs.count - 1).pending)
                msgs.setProperty(msgs.count - 1, "text", text)
            else
                msgs.append({ role: "assistant", text: text, pending: true })
            win.scrollToEnd()
        }
        function onStreamDone(ok) {
            if (!msgs.count || !msgs.get(msgs.count - 1).pending) return
            if (msgs.get(msgs.count - 1).text === "") msgs.remove(msgs.count - 1)
            else msgs.setProperty(msgs.count - 1, "pending", false)
        }
        function onReset() { msgs.clear() }
        function onLibraryChanged() { if (win.page === "library") win.reloadLibrary() }
        function onInstallProgress(id, pct) {
            var p = Object.assign({}, win.progress); p[id] = pct; win.progress = p
        }
        function onOpenLibraryRequested() { win.openLibrary() }
        function onInstallDialogRequested(id) { win.openLibrary(); win.dialogModel = bridge.modelInfo(id) }
    }

    Component.onCompleted: {
        var h = bridge.history()
        for (var i = 0; i < h.length; ++i) msgs.append({ role: h[i].role, text: h[i].text, pending: false })
        scrollToEnd()
    }

    Shortcut {
        sequence: "Escape"
        onActivated: {
            if (win.dialogModel) win.dialogModel = null
            else if (win.page === "library") win.page = "chat"
            else win.hide()
        }
    }

    // ------------------------------------------------------------------ frame
    Item {
        id: frame
        anchors.fill: parent
        anchors.margins: 26

        // Soft shadow built from stacked translucent layers (no shader needed):
        // many thin rings whose opacity falls off with distance from the card.
        Repeater {
            model: 18
            Rectangle {
                readonly property real spread: index * 1.25
                x: -spread
                y: -spread + 9
                width: frame.width + spread * 2
                height: frame.height + spread * 2
                radius: card.radius + spread
                color: Qt.rgba(0.08, 0.07, 0.22, (ui.dark ? 0.055 : 0.016) * (1 - index / 20))
            }
        }

        Rectangle {
            id: card
            anchors.fill: parent
            radius: 26
            color: ui.card
            border.width: 1
            border.color: ui.border
            clip: true

            // Gentle brand glow behind the header.
            Rectangle {
                width: parent.width
                height: 220
                gradient: Gradient {
                    GradientStop { position: 0; color: ui.dark ? Qt.rgba(0.42, 0.36, 0.98, 0.16) : Qt.rgba(0.42, 0.36, 0.98, 0.07) }
                    GradientStop { position: 1; color: "transparent" }
                }
            }

            // -------------------------------------------------------- header
            Item {
                id: header
                anchors { left: parent.left; right: parent.right; top: parent.top }
                height: 66

                Row {
                    anchors.left: parent.left
                    anchors.leftMargin: 22
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 12
                    Logo { size: 30; anchors.verticalCenter: parent.verticalCenter }
                    Text {
                        text: bridge.t.title
                        color: ui.text
                        font.pixelSize: 17
                        font.weight: Font.Bold
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Rectangle {   // active model chip -> opens the library
                        id: modelChip
                        height: 28
                        width: chipRow.implicitWidth + 22
                        radius: 14
                        color: chipMouse.containsMouse ? ui.hover : ui.accentSoft
                        anchors.verticalCenter: parent.verticalCenter
                        Behavior on color { ColorAnimation { duration: 120 } }
                        Row {
                            id: chipRow
                            anchors.centerIn: parent
                            spacing: 7
                            Rectangle {
                                width: 7; height: 7; radius: 3.5
                                color: bridge.hasModel ? ui.ok : ui.warn
                                anchors.verticalCenter: parent.verticalCenter
                            }
                            Text {
                                text: bridge.hasModel ? bridge.modelName : bridge.t.no_model
                                color: ui.dark ? "#c7c9ff" : "#4f46e5"
                                font.pixelSize: 12
                                font.weight: Font.DemiBold
                                anchors.verticalCenter: parent.verticalCenter
                            }
                        }
                        MouseArea {
                            id: chipMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: win.openLibrary()
                        }
                    }
                }

                Row {
                    anchors.right: parent.right
                    anchors.rightMargin: 16
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 2
                    IconButton { icon: "grid"; theme: ui; onClicked: win.page === "library" ? win.page = "chat" : win.openLibrary() }
                    IconButton { icon: "pencil"; theme: ui; onClicked: { bridge.newChat(); win.page = "chat" } }
                    IconButton { icon: "close"; theme: ui; iconSize: 16; onClicked: win.hide() }
                }
            }

            // -------------------------------------------------------- pages
            Item {
                id: pages
                anchors { left: parent.left; right: parent.right; top: header.bottom; bottom: parent.bottom }

                states: State {
                    name: "library"
                    when: win.page === "library"
                    PropertyChanges { target: chatPage; x: bridge.softwareRender ? 0 : -50; opacity: 0 }
                    PropertyChanges { target: libPage; x: 0; opacity: 1 }
                }
                transitions: Transition {
                    NumberAnimation { properties: "x,opacity"; duration: bridge.softwareRender ? 0 : 280; easing.type: Easing.OutCubic }
                }

                // ================================================= chat page
                Item {
                    id: chatPage
                    width: pages.width
                    height: pages.height
                    visible: opacity > 0.01
                    enabled: win.page === "chat"

                    ListView {
                        id: chatList
                        anchors { left: parent.left; right: parent.right; top: parent.top; bottom: noteText.top }
                        anchors.leftMargin: 22
                        anchors.rightMargin: 22
                        anchors.bottomMargin: 6
                        clip: true
                        spacing: 16
                        topMargin: 8
                        bottomMargin: 8
                        model: msgs
                        boundsBehavior: Flickable.StopAtBounds
                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded; width: 6 }

                        add: Transition {
                            ParallelAnimation {
                                NumberAnimation { property: "opacity"; from: 0; to: 1; duration: 240 }
                                NumberAnimation { property: "scale"; from: 0.97; to: 1; duration: 240; easing.type: Easing.OutCubic }
                            }
                        }

                        delegate: Item {
                            id: d
                            required property string role
                            required property string text
                            required property bool pending
                            readonly property bool mine: role === "user"
                            readonly property bool typing: pending && text === ""
                            width: ListView.view.width
                            height: bubble.height + (d.mine ? 0 : 26)

                            Logo {
                                id: avatar
                                visible: !d.mine
                                size: 28
                                anchors.left: parent.left
                                anchors.top: parent.top
                            }

                            readonly property string html: d.mine ? "" : bridge.md(d.text)

                            Text {   // measures the natural width of the message
                                id: measure
                                visible: false
                                text: d.mine ? d.text : d.html
                                textFormat: d.mine ? Text.PlainText : Text.RichText
                                font.pixelSize: 14
                            }

                            HoverHandler { id: rowHover }

                            Rectangle {
                                id: bubble
                                anchors.right: d.mine ? parent.right : undefined
                                anchors.left: d.mine ? undefined : avatar.right
                                anchors.leftMargin: 10
                                width: d.typing ? 66 : Math.min(measure.implicitWidth + 32, d.width * (d.mine ? 0.72 : 0.82))
                                height: d.typing ? 40 : body.contentHeight + 22
                                radius: 18
                                color: d.mine ? "transparent" : ui.bubble
                                border.width: d.mine ? 0 : 1
                                border.color: ui.borderSoft

                                Rectangle {
                                    anchors.fill: parent
                                    radius: parent.radius
                                    visible: d.mine
                                    gradient: Gradient {
                                        orientation: Gradient.Horizontal
                                        GradientStop { position: 0; color: "#6366f1" }
                                        GradientStop { position: 1; color: "#a855f7" }
                                    }
                                }

                                TextEdit {
                                    id: body
                                    visible: !d.typing
                                    x: 16
                                    y: 11
                                    width: parent.width - 32
                                    text: d.mine ? d.text : d.html
                                    textFormat: d.mine ? TextEdit.PlainText : TextEdit.RichText
                                    wrapMode: TextEdit.Wrap
                                    readOnly: true
                                    selectByMouse: true
                                    color: d.mine ? "white" : ui.text
                                    selectionColor: d.mine ? Qt.rgba(1, 1, 1, 0.35) : ui.accentSoft
                                    selectedTextColor: d.mine ? "white" : ui.text
                                    font.pixelSize: 14
                                }

                                Row {   // copy (assistant answers, on hover)
                                    visible: !d.mine && !d.pending
                                    opacity: rowHover.hovered ? 1 : 0
                                    Behavior on opacity { NumberAnimation { duration: 150 } }
                                    anchors.top: parent.bottom
                                    anchors.topMargin: 4
                                    anchors.left: parent.left
                                    anchors.leftMargin: 4
                                    spacing: 4
                                    Rectangle {
                                        width: copyRow.implicitWidth + 16
                                        height: 22
                                        radius: 11
                                        color: copyMouse.containsMouse ? ui.hover : "transparent"
                                        Row {
                                            id: copyRow
                                            anchors.centerIn: parent
                                            spacing: 4
                                            Icon { name: copied ? "check" : "copy"; size: 13; stroke: 1.7; color: ui.sub; anchors.verticalCenter: parent.verticalCenter
                                                   property bool copied: false; id: copyIcon }
                                            Text { text: copyIcon.copied ? bridge.t.copied : bridge.t.copy; color: ui.sub; font.pixelSize: 11; anchors.verticalCenter: parent.verticalCenter }
                                        }
                                        MouseArea {
                                            id: copyMouse
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            cursorShape: Qt.PointingHandCursor
                                            onClicked: { bridge.copy(d.text); copyIcon.copied = true; copyReset.restart() }
                                        }
                                        Timer { id: copyReset; interval: 1500; onTriggered: copyIcon.copied = false }
                                    }
                                }

                                Row {   // typing indicator
                                    visible: d.typing
                                    anchors.centerIn: parent
                                    spacing: 6
                                    Repeater {
                                        model: 3
                                        Rectangle {
                                            required property int index
                                            width: 7; height: 7; radius: 3.5
                                            color: ui.accent
                                            opacity: 0.3
                                            SequentialAnimation on opacity {
                                                loops: Animation.Infinite
                                                running: d.typing
                                                PauseAnimation { duration: index * 160 }
                                                NumberAnimation { from: 0.3; to: 1; duration: 300 }
                                                NumberAnimation { from: 1; to: 0.3; duration: 300 }
                                                PauseAnimation { duration: (2 - index) * 160 }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Empty state: greeting + suggestion cards
                    Column {
                        id: empty
                        anchors.centerIn: chatList
                        spacing: 0
                        visible: opacity > 0.01
                        opacity: msgs.count === 0 ? 1 : 0
                        Behavior on opacity { NumberAnimation { duration: 200 } }

                        Logo {
                            id: bigLogo
                            size: 64
                            anchors.horizontalCenter: parent.horizontalCenter
                            transform: Translate { id: floatY; y: 0 }
                            SequentialAnimation {
                                running: empty.visible
                                loops: Animation.Infinite
                                NumberAnimation { target: floatY; property: "y"; from: 0; to: -6; duration: 1600; easing.type: Easing.InOutSine }
                                NumberAnimation { target: floatY; property: "y"; from: -6; to: 0; duration: 1600; easing.type: Easing.InOutSine }
                            }
                        }
                        Item { width: 1; height: 18 }
                        Text {
                            text: bridge.t.greeting
                            color: ui.text
                            font.pixelSize: 26
                            font.weight: Font.Bold
                            anchors.horizontalCenter: parent.horizontalCenter
                        }
                        Item { width: 1; height: 8 }
                        Text {
                            text: bridge.t.greeting_sub
                            color: ui.sub
                            font.pixelSize: 13
                            anchors.horizontalCenter: parent.horizontalCenter
                        }
                        Item { width: 1; height: 26 }
                        Grid {
                            columns: 2
                            spacing: 12
                            anchors.horizontalCenter: parent.horizontalCenter
                            Repeater {
                                model: bridge.suggestions
                                Rectangle {
                                    required property var modelData
                                    width: Math.min(300, (chatList.width - 12) / 2)
                                    height: 68
                                    radius: 18
                                    color: sugMouse.containsMouse ? ui.hover : ui.surface
                                    border.width: 1
                                    border.color: sugMouse.containsMouse ? Qt.rgba(0.39, 0.4, 0.95, 0.45) : ui.border
                                    scale: sugMouse.pressed ? 0.98 : 1
                                    Behavior on color { ColorAnimation { duration: 120 } }
                                    Behavior on scale { NumberAnimation { duration: 90 } }
                                    Row {
                                        anchors.left: parent.left
                                        anchors.leftMargin: 14
                                        anchors.right: parent.right
                                        anchors.rightMargin: 14
                                        anchors.verticalCenter: parent.verticalCenter
                                        spacing: 12
                                        Rectangle {
                                            width: 36; height: 36; radius: 11
                                            color: Qt.rgba(Qt.color(modelData.tint).r, Qt.color(modelData.tint).g, Qt.color(modelData.tint).b, ui.dark ? 0.22 : 0.12)
                                            anchors.verticalCenter: parent.verticalCenter
                                            Icon { anchors.centerIn: parent; name: modelData.icon; size: 18; color: modelData.tint }
                                        }
                                        Text {
                                            width: parent.width - 48
                                            text: modelData.label
                                            color: ui.text
                                            font.pixelSize: 13
                                            wrapMode: Text.WordWrap
                                            maximumLineCount: 2
                                            elide: Text.ElideRight
                                            anchors.verticalCenter: parent.verticalCenter
                                        }
                                    }
                                    MouseArea {
                                        id: sugMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: bridge.send(modelData.prompt)
                                    }
                                }
                            }
                        }
                    }

                    Text {
                        id: noteText
                        anchors { left: parent.left; right: parent.right; bottom: inputBar.top }
                        anchors.leftMargin: 28
                        anchors.rightMargin: 28
                        anchors.bottomMargin: bridge.note ? 10 : 0
                        height: bridge.note ? implicitHeight : 0
                        text: bridge.note
                        color: ui.warn
                        font.pixelSize: 12
                        wrapMode: Text.WordWrap
                    }

                    // Input
                    Rectangle {
                        id: inputBar
                        anchors { left: parent.left; right: parent.right; bottom: footer.top }
                        anchors.leftMargin: 20
                        anchors.rightMargin: 20
                        anchors.bottomMargin: 10
                        height: 54
                        radius: 27
                        color: ui.surface
                        border.width: input.activeFocus ? 1.5 : 1
                        border.color: input.activeFocus ? Qt.rgba(0.39, 0.4, 0.95, 0.7) : ui.border
                        Behavior on border.color { ColorAnimation { duration: 150 } }

                        TextField {
                            id: input
                            anchors.left: parent.left
                            anchors.leftMargin: 22
                            anchors.right: sendBtn.left
                            anchors.rightMargin: 10
                            anchors.verticalCenter: parent.verticalCenter
                            background: null
                            placeholderText: bridge.t.placeholder
                            placeholderTextColor: ui.sub
                            color: ui.text
                            selectionColor: ui.accentSoft
                            selectedTextColor: ui.text
                            font.pixelSize: 14
                            focus: true
                            onAccepted: win.submit()
                        }

                        Rectangle {
                            id: sendBtn
                            width: 40; height: 40; radius: 20
                            anchors.right: parent.right
                            anchors.rightMargin: 7
                            anchors.verticalCenter: parent.verticalCenter
                            color: ui.surface2
                            scale: sendMouse.pressed && win.canSend ? 0.92 : 1
                            Behavior on scale { NumberAnimation { duration: 90 } }
                            Rectangle {
                                anchors.fill: parent
                                radius: parent.radius
                                opacity: win.canSend ? 1 : 0
                                Behavior on opacity { NumberAnimation { duration: 150 } }
                                gradient: Gradient {
                                    orientation: Gradient.Horizontal
                                    GradientStop { position: 0; color: "#6366f1" }
                                    GradientStop { position: 1; color: "#a855f7" }
                                }
                            }
                            Icon {
                                anchors.centerIn: parent
                                name: "send"
                                size: 18
                                stroke: 2.2
                                color: win.canSend ? "white" : ui.sub
                            }
                            MouseArea {
                                id: sendMouse
                                anchors.fill: parent
                                cursorShape: win.canSend ? Qt.PointingHandCursor : Qt.ArrowCursor
                                onClicked: win.submit()
                            }
                        }
                    }

                    Row {
                        id: footer
                        anchors.horizontalCenter: parent.horizontalCenter
                        anchors.bottom: parent.bottom
                        anchors.bottomMargin: 14
                        spacing: 6
                        Icon { name: "lock"; size: 12; stroke: 1.8; color: ui.sub; anchors.verticalCenter: parent.verticalCenter }
                        Text { text: bridge.t.private; color: ui.sub; font.pixelSize: 11 }
                        Text { text: "·"; color: ui.sub; font.pixelSize: 11 }
                        Text { text: bridge.t.hotkey; color: ui.sub; font.pixelSize: 11 }
                    }
                }

                // ================================================= library page
                Item {
                    id: libPage
                    x: bridge.softwareRender ? 0 : pages.width
                    opacity: 0
                    width: pages.width
                    height: pages.height
                    visible: opacity > 0.01
                    enabled: win.page === "library"

                    Column {
                        id: libTop
                        anchors { left: parent.left; right: parent.right; top: parent.top }
                        anchors.leftMargin: 22
                        anchors.rightMargin: 22
                        spacing: 12

                        Item {
                            width: parent.width
                            height: 40
                            Row {
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: 6
                                IconButton { icon: "back"; theme: ui; onClicked: win.page = "chat" }
                                Column {
                                    anchors.verticalCenter: parent.verticalCenter
                                    Text { text: bridge.t.lib_title; color: ui.text; font.pixelSize: 20; font.weight: Font.Bold }
                                    Text { text: bridge.t.lib_sub; color: ui.sub; font.pixelSize: 12 }
                                }
                            }
                            Rectangle {
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                height: 30
                                width: ramRow.implicitWidth + 24
                                radius: 15
                                color: ui.surface2
                                Row {
                                    id: ramRow
                                    anchors.centerIn: parent
                                    spacing: 6
                                    Icon { name: "chip"; size: 15; stroke: 1.6; color: ui.sub; anchors.verticalCenter: parent.verticalCenter }
                                    Text {
                                        text: bridge.t.this_pc + " · RAM " + bridge.ramGb.toFixed(1) + " GB"
                                        color: ui.text
                                        font.pixelSize: 12
                                        font.weight: Font.DemiBold
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }
                            }
                        }

                        Flow {   // language chips
                            width: parent.width
                            spacing: 8
                            Repeater {
                                model: bridge.languages
                                Rectangle {
                                    required property var modelData
                                    readonly property bool active: win.libLang === modelData.code
                                    height: 30
                                    width: langText.implicitWidth + 26
                                    radius: 15
                                    color: active ? "transparent" : (langMouse.containsMouse ? ui.hover : ui.surface)
                                    border.width: active ? 0 : 1
                                    border.color: ui.border
                                    Rectangle {
                                        anchors.fill: parent
                                        radius: parent.radius
                                        visible: parent.active
                                        gradient: Gradient {
                                            orientation: Gradient.Horizontal
                                            GradientStop { position: 0; color: "#6366f1" }
                                            GradientStop { position: 1; color: "#a855f7" }
                                        }
                                    }
                                    Text {
                                        id: langText
                                        anchors.centerIn: parent
                                        text: modelData.name
                                        color: parent.active ? "white" : ui.text
                                        font.pixelSize: 12
                                        font.weight: Font.DemiBold
                                    }
                                    MouseArea {
                                        id: langMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: { win.libLang = modelData.code; win.reloadLibrary() }
                                    }
                                }
                            }
                        }

                        Row {
                            width: parent.width
                            spacing: 10
                            Rectangle {   // search
                                width: parent.width - allToggle.width - 10
                                height: 38
                                radius: 19
                                color: ui.surface
                                border.width: 1
                                border.color: search.activeFocus ? Qt.rgba(0.39, 0.4, 0.95, 0.7) : ui.border
                                Icon {
                                    id: searchIcon
                                    name: "search"; size: 16; color: ui.sub
                                    anchors.left: parent.left; anchors.leftMargin: 14
                                    anchors.verticalCenter: parent.verticalCenter
                                }
                                TextField {
                                    id: search
                                    anchors.left: searchIcon.right
                                    anchors.leftMargin: 6
                                    anchors.right: parent.right
                                    anchors.rightMargin: 12
                                    anchors.verticalCenter: parent.verticalCenter
                                    background: null
                                    placeholderText: bridge.t.search
                                    placeholderTextColor: ui.sub
                                    color: ui.text
                                    font.pixelSize: 13
                                    onTextChanged: { win.libQuery = text; win.reloadLibrary() }
                                }
                            }
                            Rectangle {   // "show all" toggle
                                id: allToggle
                                height: 38
                                width: allRow.implicitWidth + 26
                                radius: 19
                                color: win.libAll ? ui.accentSoft : ui.surface
                                border.width: 1
                                border.color: win.libAll ? Qt.rgba(0.39, 0.4, 0.95, 0.5) : ui.border
                                Row {
                                    id: allRow
                                    anchors.centerIn: parent
                                    spacing: 8
                                    Rectangle {   // switch
                                        width: 30; height: 18; radius: 9
                                        color: win.libAll ? ui.accent : ui.surface2
                                        border.width: win.libAll ? 0 : 1
                                        border.color: ui.border
                                        anchors.verticalCenter: parent.verticalCenter
                                        Behavior on color { ColorAnimation { duration: 150 } }
                                        Rectangle {
                                            width: 14; height: 14; radius: 7
                                            color: "white"
                                            y: 2
                                            x: win.libAll ? 14 : 2
                                            Behavior on x { NumberAnimation { duration: 150; easing.type: Easing.OutCubic } }
                                        }
                                    }
                                    Text {
                                        text: bridge.t.show_all
                                        color: ui.text
                                        font.pixelSize: 12
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: { win.libAll = !win.libAll; win.reloadLibrary() }
                                }
                            }
                        }
                    }

                    Text {
                        id: libNote
                        anchors { left: parent.left; right: parent.right; top: libTop.bottom }
                        anchors.leftMargin: 26
                        anchors.topMargin: bridge.note ? 10 : 0
                        height: bridge.note ? implicitHeight : 0
                        text: bridge.note
                        color: ui.warn
                        font.pixelSize: 12
                        wrapMode: Text.WordWrap
                    }

                    ListView {
                        id: libList
                        anchors { left: parent.left; right: parent.right; top: libNote.bottom; bottom: parent.bottom }
                        anchors.topMargin: 14
                        anchors.leftMargin: 22
                        anchors.rightMargin: 22
                        clip: true
                        spacing: 10
                        bottomMargin: 18
                        model: win.libModels
                        boundsBehavior: Flickable.StopAtBounds
                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded; width: 6 }

                        Text {
                            anchors.centerIn: parent
                            visible: libList.count === 0
                            text: bridge.t.nofit
                            color: ui.sub
                            font.pixelSize: 13
                        }

                        delegate: Rectangle {
                            id: c
                            required property var modelData
                            readonly property var m: modelData
                            readonly property int pct: win.progress[m.id] !== undefined ? win.progress[m.id] : m.progress
                            width: ListView.view.width
                            height: 96 + (m.warnings.length ? 20 : 0)
                            radius: 20
                            color: cardMouse.containsMouse ? ui.hover : ui.surface
                            border.width: 1
                            border.color: m.state === "active" ? Qt.rgba(0.29, 0.75, 0.45, 0.55)
                                        : m.recommended ? Qt.rgba(0.39, 0.4, 0.95, 0.35) : ui.border
                            Behavior on color { ColorAnimation { duration: 120 } }

                            MouseArea { id: cardMouse; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }

                            Rectangle {   // letter badge
                                id: badge
                                x: 16
                                y: 18
                                width: 42; height: 42; radius: 13
                                color: c.m.recommended ? "transparent" : ui.surface2
                                Rectangle {
                                    anchors.fill: parent
                                    radius: parent.radius
                                    visible: c.m.recommended
                                    gradient: Gradient {
                                        orientation: Gradient.Horizontal
                                        GradientStop { position: 0; color: "#6366f1" }
                                        GradientStop { position: 1; color: "#a855f7" }
                                    }
                                }
                                Text {
                                    anchors.centerIn: parent
                                    text: c.m.letter
                                    color: c.m.recommended ? "white" : ui.sub
                                    font.pixelSize: 17
                                    font.weight: Font.Bold
                                }
                            }

                            Column {
                                anchors.left: badge.right
                                anchors.leftMargin: 14
                                anchors.right: action.left
                                anchors.rightMargin: 12
                                y: 16
                                spacing: 6
                                Row {
                                    spacing: 8
                                    Text {
                                        text: c.m.name
                                        color: ui.text
                                        font.pixelSize: 15
                                        font.weight: Font.Bold
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                    Rectangle {
                                        visible: c.m.recommended
                                        height: 22
                                        width: recRow.implicitWidth + 16
                                        radius: 11
                                        color: ui.accentSoft
                                        anchors.verticalCenter: parent.verticalCenter
                                        Row {
                                            id: recRow
                                            anchors.centerIn: parent
                                            spacing: 4
                                            Icon { name: "spark"; filled: true; size: 12; color: ui.dark ? "#c7c9ff" : "#6366f1"; anchors.verticalCenter: parent.verticalCenter }
                                            Text {
                                                text: bridge.t.rec
                                                color: ui.dark ? "#c7c9ff" : "#4f46e5"
                                                font.pixelSize: 11
                                                font.weight: Font.DemiBold
                                                anchors.verticalCenter: parent.verticalCenter
                                            }
                                        }
                                    }
                                }
                                Text {
                                    text: c.m.params.toFixed(1) + "B  ·  " + c.m.sizeGb.toFixed(1) + " GB  ·  " + c.m.license
                                    color: ui.sub
                                    font.pixelSize: 12
                                }
                                Row {   // RAM meter
                                    spacing: 8
                                    Rectangle {
                                        width: 120; height: 5; radius: 2.5
                                        color: ui.surface2
                                        anchors.verticalCenter: parent.verticalCenter
                                        Rectangle {
                                            width: parent.width * Math.min(1, c.m.ratio)
                                            height: parent.height
                                            radius: parent.radius
                                            color: !c.m.fits ? ui.danger : (c.m.ratio > 0.8 ? ui.warn : ui.ok)
                                        }
                                    }
                                    Text {
                                        text: "RAM " + c.m.minRam + " GB+"
                                        color: ui.sub
                                        font.pixelSize: 11
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }
                                Row {
                                    visible: c.m.warnings.length > 0
                                    spacing: 5
                                    Icon { name: "warn"; size: 13; stroke: 1.8; color: ui.warn; anchors.verticalCenter: parent.verticalCenter }
                                    Text {
                                        text: c.m.warnings.join("  ·  ")
                                        color: ui.warn
                                        font.pixelSize: 12
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }
                            }

                            Item {
                                id: action
                                anchors.right: parent.right
                                anchors.rightMargin: 16
                                anchors.verticalCenter: parent.verticalCenter
                                width: 110
                                height: 36

                                PillButton {
                                    anchors.right: parent.right
                                    anchors.verticalCenter: parent.verticalCenter
                                    visible: c.m.state === "install"
                                    primary: true
                                    icon: "download"
                                    text: bridge.t.install
                                    theme: ui
                                    onClicked: win.dialogModel = bridge.modelInfo(c.m.id)
                                }
                                PillButton {
                                    anchors.right: parent.right
                                    anchors.verticalCenter: parent.verticalCenter
                                    visible: c.m.state === "installed"
                                    text: bridge.t.use
                                    theme: ui
                                    onClicked: bridge.useModel(c.m.id)
                                }
                                Rectangle {
                                    anchors.right: parent.right
                                    anchors.verticalCenter: parent.verticalCenter
                                    visible: c.m.state === "active"
                                    height: 36
                                    width: activeRow.implicitWidth + 28
                                    radius: 18
                                    color: ui.okSoft
                                    Row {
                                        id: activeRow
                                        anchors.centerIn: parent
                                        spacing: 6
                                        Icon { name: "check"; size: 16; stroke: 2.2; color: ui.ok; anchors.verticalCenter: parent.verticalCenter }
                                        Text { text: bridge.t.in_use; color: ui.ok; font.pixelSize: 13; font.weight: Font.DemiBold; anchors.verticalCenter: parent.verticalCenter }
                                    }
                                }
                                Column {
                                    anchors.right: parent.right
                                    anchors.verticalCenter: parent.verticalCenter
                                    visible: c.m.state === "installing"
                                    spacing: 6
                                    Text {
                                        anchors.right: parent.right
                                        text: bridge.t.installing + " " + c.pct + "%"
                                        color: ui.text
                                        font.pixelSize: 12
                                        font.weight: Font.DemiBold
                                    }
                                    Rectangle {
                                        width: 110; height: 6; radius: 3
                                        color: ui.surface2
                                        Rectangle {
                                            width: parent.width * c.pct / 100
                                            height: parent.height
                                            radius: parent.radius
                                            Behavior on width { NumberAnimation { duration: 200 } }
                                            gradient: Gradient {
                                                orientation: Gradient.Horizontal
                                                GradientStop { position: 0; color: "#6366f1" }
                                                GradientStop { position: 1; color: "#a855f7" }
                                            }
                                        }
                                    }
                                }
                                Text {
                                    anchors.right: parent.right
                                    anchors.verticalCenter: parent.verticalCenter
                                    visible: c.m.state === "toobig"
                                    text: bridge.t.too_big
                                    color: ui.danger
                                    font.pixelSize: 12
                                    font.weight: Font.DemiBold
                                }
                            }
                        }
                    }
                }
            }

            // -------------------------------------------------------- install dialog
            Rectangle {
                id: scrim
                anchors.fill: parent
                radius: card.radius
                color: ui.dark ? Qt.rgba(0, 0, 0, 0.55) : Qt.rgba(0.08, 0.08, 0.16, 0.30)
                visible: opacity > 0.01
                opacity: win.dialogModel ? 1 : 0
                Behavior on opacity { NumberAnimation { duration: 180 } }
                MouseArea { anchors.fill: parent; onClicked: win.dialogModel = null }

                Rectangle {
                    id: dialog
                    anchors.centerIn: parent
                    width: 460
                    height: dlgCol.implicitHeight + 48
                    radius: 22
                    color: ui.card
                    border.width: 1
                    border.color: ui.border
                    scale: win.dialogModel ? 1 : 0.94
                    Behavior on scale { NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }
                    MouseArea { anchors.fill: parent }

                    Column {
                        id: dlgCol
                        x: 26
                        y: 24
                        width: parent.width - 52
                        spacing: 14
                        Row {
                            spacing: 12
                            Logo { size: 40 }
                            Column {
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: 2
                                Text {
                                    text: win.dialogModel ? win.dialogModel.name : ""
                                    color: ui.text
                                    font.pixelSize: 18
                                    font.weight: Font.Bold
                                }
                                Text {
                                    text: win.dialogModel ? bridge.t.download_size.arg(win.dialogModel.sizeGb.toFixed(1)) : ""
                                    color: ui.sub
                                    font.pixelSize: 12
                                }
                            }
                        }
                        Rectangle {
                            width: parent.width
                            height: licCol.implicitHeight + 24
                            radius: 14
                            color: ui.surface2
                            Column {
                                id: licCol
                                x: 14; y: 12
                                width: parent.width - 28
                                spacing: 6
                                Text {
                                    width: parent.width
                                    text: win.dialogModel
                                          ? bridge.t.license_label + " <a href=\"" + win.dialogModel.licenseUrl + "\">" + win.dialogModel.license + "</a>"
                                          : ""
                                    textFormat: Text.StyledText
                                    linkColor: ui.dark ? "#a5b4fc" : "#4f46e5"
                                    color: ui.text
                                    font.pixelSize: 13
                                    onLinkActivated: (link) => bridge.openUrl(link)
                                }
                                Repeater {
                                    model: win.dialogModel ? win.dialogModel.warnings : []
                                    Row {
                                        required property string modelData
                                        spacing: 6
                                        Icon { name: "warn"; size: 13; stroke: 1.8; color: ui.warn; anchors.verticalCenter: parent.verticalCenter }
                                        Text { text: modelData; color: ui.warn; font.pixelSize: 12; anchors.verticalCenter: parent.verticalCenter }
                                    }
                                }
                                Text {
                                    width: parent.width
                                    visible: text !== ""
                                    text: win.dialogModel ? win.dialogModel.notes : ""
                                    color: ui.sub
                                    font.pixelSize: 12
                                    wrapMode: Text.WordWrap
                                }
                            }
                        }
                        Text {
                            width: parent.width
                            text: bridge.t.license_q
                            color: ui.text
                            font.pixelSize: 13
                            wrapMode: Text.WordWrap
                        }
                        Item {
                            width: parent.width
                            height: 38
                            Row {
                                anchors.right: parent.right
                                spacing: 8
                                PillButton { text: bridge.t.cancel; theme: ui; onClicked: win.dialogModel = null }
                                PillButton {
                                    primary: true
                                    icon: "download"
                                    text: bridge.t.agree_install
                                    theme: ui
                                    onClicked: {
                                        var id = win.dialogModel.id
                                        win.dialogModel = null
                                        bridge.installModel(id)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
