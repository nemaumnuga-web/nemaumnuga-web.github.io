// Nuri Welcome - first-login guide. QtQuick + Controls.Basic only, SVG art,
// so it renders the same with any GPU and with the software renderer.
import QtQuick
import QtQuick.Controls.Basic

Window {
    id: win
    width: 900
    height: 680
    minimumWidth: 780
    minimumHeight: 620
    visible: false
    title: bridge.t.title
    color: ui.card

    readonly property var steps: ["hello", "ai", "look", "comfort", "windows", "input", "privacy", "done"]
    property int page: 0
    property string aiLang: bridge.lang
    property bool darkPick: bridge.dark
    property string accent: bridge.accents[0]
    property bool buttonsLeft: true
    property bool singleClick: false
    function go(d) { page = Math.max(0, Math.min(steps.length - 1, page + d)) }
    function icon(ctx, name) { return bridge.iconDir + "/" + ctx + "/" + name + ".svg" }

    QtObject {
        id: ui
        property bool dark: bridge.dark
        property color card: dark ? "#14151d" : "#fbfbfe"
        property color surface: dark ? "#1c1e28" : "#ffffff"
        property color surface2: dark ? "#242735" : "#f2f3f9"
        property color hover: dark ? "#2a2d3d" : "#eef0fb"
        property color border: dark ? "#2b2e3d" : "#e4e6f0"
        property color text: dark ? "#ececf4" : "#16171f"
        property color sub: dark ? "#9497ab" : "#6a6d80"
        property color accent: win.accent
        property color accentSoft: Qt.rgba(accent.r, accent.g, accent.b, dark ? 0.22 : 0.10)
        Behavior on card { ColorAnimation { duration: 250 } }
    }

    // ---------------------------------------------------------------- building blocks
    component Page: Item {
        property string name
        anchors.fill: parent
        visible: opacity > 0
        opacity: win.steps[win.page] === name ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 260; easing.type: Easing.OutCubic } }
        transform: Translate {
            x: win.steps[win.page] === name ? 0 : (win.steps.indexOf(name) < win.page ? -40 : 40)
            Behavior on x { NumberAnimation { duration: 320; easing.type: Easing.OutCubic } }
        }
    }
    component Heading: Column {
        property alias title: h.text
        property alias sub: s.text
        property string art: ""
        width: parent.width
        spacing: 10
        Image {
            visible: parent.art !== ""
            anchors.horizontalCenter: parent.horizontalCenter
            width: 76; height: 76; sourceSize: Qt.size(152, 152)
            source: parent.art
        }
        Text { id: h; width: parent.width; horizontalAlignment: Text.AlignHCenter
               font.pixelSize: 28; font.weight: Font.Bold; color: ui.text; wrapMode: Text.Wrap }
        Text { id: s; width: Math.min(parent.width, 560); anchors.horizontalCenter: parent.horizontalCenter
               horizontalAlignment: Text.AlignHCenter; font.pixelSize: 15; color: ui.sub; wrapMode: Text.Wrap
               lineHeight: 1.25 }
    }
    component Choice: Rectangle {
        property bool on: false
        property alias label: lbl.text
        signal picked()
        implicitWidth: lbl.implicitWidth + 40
        height: 40
        radius: 12
        color: on ? ui.accentSoft : (m.containsMouse ? ui.hover : ui.surface)
        border.width: on ? 2 : 1
        border.color: on ? ui.accent : ui.border
        Behavior on color { ColorAnimation { duration: 120 } }
        Text { id: lbl; anchors.centerIn: parent; color: ui.text; font.pixelSize: 14
               font.weight: parent.on ? Font.DemiBold : Font.Normal }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                    onClicked: parent.picked() }
    }
    component InfoRow: Rectangle {
        property string art
        property alias text: tx.text
        width: parent.width
        height: Math.max(44, tx.implicitHeight) + 24
        radius: 16
        color: ui.surface
        border.color: ui.border
        Image { x: 14; anchors.verticalCenter: parent.verticalCenter
                width: 40; height: 40; sourceSize: Qt.size(80, 80); source: parent.art }
        Text { id: tx; x: 68; width: parent.width - 84; anchors.verticalCenter: parent.verticalCenter
               font.pixelSize: 15; color: ui.text; wrapMode: Text.Wrap; lineHeight: 1.2 }
    }

    component Key: Rectangle {
        property alias label: kl.text
        width: Math.max(64, kl.implicitWidth + 32); height: 64; radius: 14
        color: ui.surface; border.color: ui.border
        Rectangle { anchors.fill: parent; anchors.topMargin: parent.height - 5; radius: 14
                    color: ui.border; z: -1 }
        Text { id: kl; anchors.centerIn: parent; color: ui.text; font.pixelSize: 20; font.weight: Font.DemiBold }
    }

    // ---------------------------------------------------------------- header art
    Rectangle {
        anchors.top: parent.top
        width: parent.width
        height: 220
        opacity: ui.dark ? 0.55 : 0.9
        gradient: Gradient {
            GradientStop { position: 0; color: Qt.rgba(ui.accent.r, ui.accent.g, ui.accent.b, 0.16) }
            GradientStop { position: 1; color: "transparent" }
        }
    }

    // ---------------------------------------------------------------- pages
    Item {
        id: stage
        anchors { left: parent.left; right: parent.right; top: parent.top; bottom: footer.top }
        anchors.margins: 40
        anchors.topMargin: 30
        anchors.bottomMargin: 26

        // 1. hello ----------------------------------------------------------
        Page {
            name: "hello"
            Column {
                anchors.centerIn: parent
                width: parent.width
                spacing: 18
                Logo {
                    size: 112
                    anchors.horizontalCenter: parent.horizontalCenter
                    SequentialAnimation on y {
                        loops: Animation.Infinite
                        NumberAnimation { from: 0; to: -8; duration: 1800; easing.type: Easing.InOutSine }
                        NumberAnimation { from: -8; to: 0; duration: 1800; easing.type: Easing.InOutSine }
                    }
                }
                Item {
                    width: parent.width; height: 70
                    Text {
                        id: hello
                        property int i: 0
                        anchors.centerIn: parent
                        text: bridge.hello[i]
                        font.pixelSize: 54
                        font.weight: Font.Bold
                        color: ui.text
                        SequentialAnimation {
                            running: win.page === 0
                            loops: Animation.Infinite
                            PauseAnimation { duration: 1500 }
                            NumberAnimation { target: hello; property: "opacity"; to: 0; duration: 320 }
                            ScriptAction { script: hello.i = (hello.i + 1) % bridge.hello.length }
                            NumberAnimation { target: hello; property: "opacity"; to: 1; duration: 320 }
                        }
                    }
                }
                Text { width: Math.min(parent.width, 640); anchors.horizontalCenter: parent.horizontalCenter
                       horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; lineHeight: 1.25
                       text: bridge.t.hello_sub; font.pixelSize: 15; color: ui.sub }
            }
        }

        // 2. AI ---------------------------------------------------------------
        Page {
            name: "ai"
            Column {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                spacing: 18
                Heading { title: bridge.t.ai_title; sub: bridge.t.ai_sub; art: win.icon("apps", "nuri-assistant") }
                Flow {
                    width: parent.width
                    spacing: 8
                    leftPadding: Math.max(0, (width - langRow.implicitW) / 2)
                    id: langRow
                    readonly property real implicitW: bridge.languages.length * 98
                    Repeater {
                        model: bridge.languages
                        Choice { width: 90; label: modelData.name; on: win.aiLang === modelData.code
                                 onPicked: win.aiLang = modelData.code }
                    }
                }
                Column {
                    width: Math.min(parent.width, 560)
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: 8
                    Repeater {
                        model: bridge.picks(win.aiLang)
                        Rectangle {
                            width: parent.width; height: 52; radius: 14
                            color: ui.surface; border.color: ui.border
                            Rectangle {
                                x: 12; anchors.verticalCenter: parent.verticalCenter
                                width: 30; height: 30; radius: 9; color: ui.accentSoft
                                Text { anchors.centerIn: parent; text: "ABC"[index]; color: ui.accent
                                       font.weight: Font.Bold; font.pixelSize: 14 }
                            }
                            Text { x: 54; anchors.verticalCenter: parent.verticalCenter
                                   text: (modelData.star ? "✨ " : "") + modelData.name
                                   color: ui.text; font.pixelSize: 15; font.weight: Font.DemiBold }
                            Text { anchors.right: parent.right; anchors.rightMargin: 16
                                   anchors.verticalCenter: parent.verticalCenter
                                   text: modelData.params + " · " + modelData.size; color: ui.sub; font.pixelSize: 13 }
                        }
                    }
                    Text { visible: bridge.picks(win.aiLang).length === 0; width: parent.width; wrapMode: Text.Wrap
                           text: bridge.t.ai_none; color: ui.sub; font.pixelSize: 14 }
                }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: 14
                    PillButton { theme: ui; primary: true; icon: "download"; text: bridge.t.ai_get
                                 onClicked: bridge.open("library") }
                    Text { anchors.verticalCenter: parent.verticalCenter; color: ui.sub; font.pixelSize: 13
                           text: bridge.t.ai_ram.replace("%s", bridge.ramText) }
                }
                Text { width: parent.width; horizontalAlignment: Text.AlignHCenter; text: bridge.t.ai_later
                       color: ui.sub; font.pixelSize: 13 }
            }
        }

        // 3. look -------------------------------------------------------------
        Page {
            name: "look"
            Column {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                spacing: 22
                Heading { title: bridge.t.look_title; sub: bridge.t.look_sub; art: win.icon("apps", "preferences-desktop-theme") }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: 28
                    Repeater {
                        model: [false, true]
                        Column {
                            spacing: 10
                            Rectangle {
                                id: thumb
                                width: 230; height: 146; radius: 14
                                border.width: win.darkPick === modelData ? 3 : 1
                                border.color: win.darkPick === modelData ? ui.accent : ui.border
                                color: "transparent"
                                // mini desktop
                                Rectangle {
                                    anchors.fill: parent; anchors.margins: 4; radius: 10; clip: true
                                    gradient: Gradient {
                                        GradientStop { position: 0; color: modelData ? "#151628" : "#eef0fb" }
                                        GradientStop { position: 0.6; color: modelData ? "#2b2156" : "#d9d2fb" }
                                        GradientStop { position: 1; color: modelData ? "#5b2a6e" : "#f8d9ec" }
                                    }
                                    Rectangle { width: parent.width; height: 10
                                                color: modelData ? "#99161721" : "#aaffffff" }
                                    Rectangle {
                                        x: 34; y: 28; width: 150; height: 86; radius: 7
                                        color: modelData ? "#1c1d29" : "#ffffff"
                                        Rectangle { width: parent.width; height: 16; radius: 7
                                                    color: modelData ? "#161721" : "#f4f5fa" }
                                        Row {
                                            x: 7; y: 5; spacing: 4
                                            Repeater {
                                                model: ["#fb5f57", "#fdbc2f", "#2ac840"]
                                                Rectangle { width: 6; height: 6; radius: 3; color: modelData }
                                            }
                                        }
                                        Rectangle { x: 10; y: 26; width: 70; height: 6; radius: 3; color: ui.accent; opacity: 0.8 }
                                        Rectangle { x: 10; y: 38; width: 120; height: 5; radius: 2.5
                                                    color: modelData ? "#3a3c4e" : "#e3e5ee" }
                                        Rectangle { x: 10; y: 48; width: 100; height: 5; radius: 2.5
                                                    color: modelData ? "#3a3c4e" : "#e3e5ee" }
                                    }
                                    Rectangle {
                                        anchors.horizontalCenter: parent.horizontalCenter; y: parent.height - 20
                                        width: 90; height: 15; radius: 6
                                        color: modelData ? "#88262838" : "#aaffffff"
                                    }
                                }
                                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                                            onClicked: { win.darkPick = modelData; bridge.setDark(modelData) } }
                            }
                            Text { anchors.horizontalCenter: parent.horizontalCenter
                                   text: modelData ? bridge.t.dark : bridge.t.light; color: ui.text
                                   font.pixelSize: 14; font.weight: win.darkPick === modelData ? Font.DemiBold : Font.Normal }
                        }
                    }
                }
                Column {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: 12
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: bridge.t.accent
                           color: ui.sub; font.pixelSize: 13 }
                    Row {
                        spacing: 14
                        Repeater {
                            model: bridge.accents
                            Rectangle {
                                width: 30; height: 30; radius: 15; color: modelData
                                border.width: win.accent === modelData ? 3 : 0
                                border.color: ui.card
                                Rectangle { anchors.centerIn: parent; width: 38; height: 38; radius: 19
                                            color: "transparent"; border.width: 2; border.color: modelData
                                            visible: win.accent === modelData }
                                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                                            onClicked: { win.accent = modelData; bridge.setAccent(modelData) } }
                            }
                        }
                    }
                }
            }
        }

        // 4. comfort -----------------------------------------------------------
        Page {
            name: "comfort"
            Column {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                spacing: 22
                Heading { title: bridge.t.comfort_title; sub: bridge.t.comfort_sub; art: win.icon("apps", "preferences-desktop-mouse") }
                Repeater {
                    model: [
                        { label: bridge.t.btn_side, a: bridge.t.btn_left, b: bridge.t.btn_right, key: "buttons" },
                        { label: bridge.t.click, a: bridge.t.click_double, b: bridge.t.click_single, key: "click" }
                    ]
                    Column {
                        anchors.horizontalCenter: parent.horizontalCenter
                        spacing: 12
                        Text { anchors.horizontalCenter: parent.horizontalCenter; text: modelData.label
                               color: ui.text; font.pixelSize: 15; font.weight: Font.DemiBold }
                        Row {
                            spacing: 12
                            anchors.horizontalCenter: parent.horizontalCenter
                            Choice {
                                width: 220; label: modelData.a
                                on: modelData.key === "buttons" ? win.buttonsLeft : !win.singleClick
                                onPicked: modelData.key === "buttons"
                                          ? (win.buttonsLeft = true, bridge.setButtonsLeft(true))
                                          : (win.singleClick = false, bridge.setSingleClick(false))
                            }
                            Choice {
                                width: 220; label: modelData.b
                                on: modelData.key === "buttons" ? !win.buttonsLeft : win.singleClick
                                onPicked: modelData.key === "buttons"
                                          ? (win.buttonsLeft = false, bridge.setButtonsLeft(false))
                                          : (win.singleClick = true, bridge.setSingleClick(true))
                            }
                        }
                    }
                }
                // live sample title bar
                Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 452; height: 38; radius: 10
                    color: ui.surface2; border.color: ui.border
                    Row {
                        x: win.buttonsLeft ? 14 : parent.width - width - 14
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: 8
                        Behavior on x { NumberAnimation { duration: 260; easing.type: Easing.OutCubic } }
                        Repeater {
                            model: win.buttonsLeft ? ["#fb5f57", "#fdbc2f", "#2ac840"] : ["#2ac840", "#fdbc2f", "#fb5f57"]
                            Rectangle { width: 13; height: 13; radius: 6.5; color: modelData }
                        }
                    }
                    Text { anchors.centerIn: parent; text: "Nuri"; color: ui.sub; font.pixelSize: 13 }
                }
            }
        }

        // 5. windows apps --------------------------------------------------------
        Page {
            name: "windows"
            Column {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.min(parent.width, 600)
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: 12
                Heading { title: bridge.t.win_title; sub: bridge.t.win_sub; art: win.icon("apps", "nuri-windows-apps") }
                InfoRow { art: win.icon("places", "folder-download"); text: bridge.t.win_exe }
                InfoRow { art: win.icon("apps", "plasma-discover"); text: bridge.t.win_bottles }
                InfoRow { art: win.icon("apps", "utilities-terminal"); text: bridge.t.win_steam }
                Item { width: 1; height: 4 }
                PillButton { anchors.horizontalCenter: parent.horizontalCenter; theme: ui; primary: true
                             icon: "download"; text: bridge.t.win_get; onClicked: bridge.open("bottles") }
            }
        }

        // 6. input -----------------------------------------------------------------
        Page {
            name: "input"
            Column {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                spacing: 28
                Heading { title: bridge.t.input_title; sub: bridge.t.input_sub; art: win.icon("apps", "preferences-desktop-keyboard") }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: 18
                    Key { label: "한/영" }
                    Text { anchors.verticalCenter: parent.verticalCenter; text: "/"; color: ui.sub; font.pixelSize: 22 }
                    Key { label: "Ctrl" }
                    Text { anchors.verticalCenter: parent.verticalCenter; text: "+"; color: ui.sub; font.pixelSize: 22 }
                    Key { label: "Space"; width: 150 }
                }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: 12
                    Rectangle {
                        width: 60; height: 30; radius: 8; color: ui.surface2; border.color: ui.border
                        Row { anchors.centerIn: parent; spacing: 8
                              Text { text: "한"; color: ui.accent; font.weight: Font.Bold; font.pixelSize: 14 }
                              Text { text: "A"; color: ui.sub; font.pixelSize: 14 } }
                    }
                    Text { anchors.verticalCenter: parent.verticalCenter; text: bridge.t.input_more
                           color: ui.sub; font.pixelSize: 14 }
                }
                PillButton { anchors.horizontalCenter: parent.horizontalCenter; theme: ui
                             icon: "pencil"; text: bridge.t.input_cfg; onClicked: bridge.open("input") }
            }
        }

        // 7. privacy & updates -------------------------------------------------------
        Page {
            name: "privacy"
            Column {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.min(parent.width, 600)
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: 16
                Heading { title: bridge.t.priv_title; sub: ""; art: win.icon("apps", "preferences-security") }
                InfoRow { art: win.icon("apps", "nuri-assistant"); text: bridge.t.priv_ai }
                InfoRow { art: win.icon("apps", "system-software-update"); text: bridge.t.priv_upd }
                Item { width: 1; height: 4 }
                PillButton { anchors.horizontalCenter: parent.horizontalCenter; theme: ui
                             icon: "download"; text: bridge.t.priv_check; onClicked: bridge.open("updates") }
            }
        }

        // 8. done ------------------------------------------------------------------
        Page {
            name: "done"
            Column {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                spacing: 24
                Heading { title: bridge.t.done_title; sub: bridge.t.done_sub; art: win.icon("apps", "nuri-welcome") }
                Grid {
                    anchors.horizontalCenter: parent.horizontalCenter
                    columns: 2
                    columnSpacing: 16
                    rowSpacing: 10
                    Repeater {
                        model: [["Meta + Space", bridge.t.k_ai], ["Meta", bridge.t.k_menu], ["Meta + E", bridge.t.k_files],
                                ["Ctrl + Alt + T", bridge.t.k_term], ["Print", bridge.t.k_shot], ["Meta + L", bridge.t.k_lock],
                                ["Alt + Tab", bridge.t.k_switch], ["Meta + W", bridge.t.k_overview]]
                        Rectangle {
                            width: 290; height: 46; radius: 12; color: ui.surface; border.color: ui.border
                            Rectangle {
                                x: 10; anchors.verticalCenter: parent.verticalCenter
                                width: kt.implicitWidth + 18; height: 28; radius: 7; color: ui.surface2; border.color: ui.border
                                Text { id: kt; anchors.centerIn: parent; text: modelData[0]; color: ui.text
                                       font.pixelSize: 12; font.weight: Font.DemiBold; font.family: "monospace" }
                            }
                            Text { anchors.right: parent.right; anchors.rightMargin: 14
                                   anchors.verticalCenter: parent.verticalCenter
                                   text: modelData[1]; color: ui.text; font.pixelSize: 14 }
                        }
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------- footer
    Item {
        id: footer
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        height: 84
        Rectangle { width: parent.width; height: 1; color: ui.border }
        PillButton {
            x: 32; anchors.verticalCenter: parent.verticalCenter
            theme: ui; icon: "back"; text: bridge.t.back
            visible: win.page > 0
            onClicked: win.go(-1)
        }
        Row {
            anchors.centerIn: parent
            spacing: 8
            Repeater {
                model: win.steps.length
                Rectangle {
                    width: index === win.page ? 22 : 8; height: 8; radius: 4
                    color: index === win.page ? ui.accent : ui.border
                    Behavior on width { NumberAnimation { duration: 200 } }
                    MouseArea { anchors.fill: parent; anchors.margins: -6; onClicked: win.page = index }
                }
            }
        }
        Text {
            anchors.right: next.left; anchors.rightMargin: 18; anchors.verticalCenter: parent.verticalCenter
            text: bridge.note; color: ui.sub; font.pixelSize: 12
        }
        PillButton {
            id: next
            anchors.right: parent.right; anchors.rightMargin: 32; anchors.verticalCenter: parent.verticalCenter
            theme: ui; primary: true
            text: win.page === 0 ? bridge.t.start : (win.page === win.steps.length - 1 ? bridge.t.finish : bridge.t.next)
            onClicked: win.page === win.steps.length - 1 ? bridge.finish() : win.go(1)
        }
    }
}
