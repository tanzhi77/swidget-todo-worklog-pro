import QtQuick 2.15
import QtQuick.Window 2.15

//%QT6_BEGIN
import QtWebEngine
import QtWebChannel
//%QT6_END

//%QT5_BEGIN
import QtWebEngine 1.10
import QtWebChannel 1.10
//%QT5_END

Window {
    id: calendarWindow

    property var hostBridge: null
    property url pageUrl: ""
    property var webProfile: null
    property string themeColor: "#3b82f6"

    title: "工作月历"
    width: 1440
    height: 990
    minimumWidth: 1080
    minimumHeight: 780
    modality: Qt.NonModal
    flags: Qt.Window | Qt.WindowTitleHint | Qt.WindowMinMaxButtonsHint | Qt.WindowCloseButtonHint
    color: "transparent"
    visible: false

    Component.onCompleted: {
        if (Qt.application.screens.length > 0) {
            var screen = Qt.application.screens[0]
            x = Math.max(screen.virtualX, screen.virtualX + (screen.width - width) / 2)
            y = Math.max(screen.virtualY, screen.virtualY + (screen.height - height) / 2)
        }
    }

    onClosing: function(close) {
        close.accepted = false
        calendarWindow.hide()
    }

    WebEngineView {
        settings.javascriptCanAccessClipboard: true
        zoomFactor: 1.5
        id: calendarWebView
        anchors.fill: parent
        backgroundColor: "transparent"
        profile: calendarWindow.webProfile
        url: calendarWindow.pageUrl
        webChannel: calendarWebChannel

        onContextMenuRequested: function(request) {
            request.accepted = true
        }
    }

    WebChannel {
        id: calendarWebChannel
        Component.onCompleted: {
            if (calendarWindow.hostBridge) {
                calendarWebChannel.registerObject("todoHost", calendarWindow.hostBridge)
            }
        }
    }
}
