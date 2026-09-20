import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Window 2.15

//%QT6_BEGIN
import QtWebEngine
import QtWebChannel
import QtQuick.Dialogs
import QtCore
//%QT6_END

//%QT5_BEGIN
import QtWebEngine 1.10
import QtWebChannel 1.10
//%QT5_END

import "@COMMON_IMPORT@"

SWidget {
    id: root

    globalRoundCornerEnabled: false
    fpsDisplayMode: SWidget.FpsDisplayMode.Never

    property string stateJson: encodeState(defaultStateJson())
    property string currentStateJson: defaultStateJson()
    property bool storageReady: false
    property var calendarWindow: null

    // Sapphire can assign the property directly without emitting persistentPropertyLoaded.
    onStateJsonChanged: {
        var restored = validatedStateJson(decodeState(stateJson))
        if (restored !== currentStateJson) {
            currentStateJson = restored
        }
    }

    function assetUrl(fileName) {
        var currentDirectory = String(Qt.resolvedUrl(".")).replace(/\\/g, "/")
        var fromCompiledDirectory = /\/compiled\d*\/?$/i.test(currentDirectory)
        return Qt.resolvedUrl((fromCompiledDirectory ? "../" : "") + fileName)
    }

    function defaultStateJson() {
        return JSON.stringify({
            schemaVersion: 2,
            revision: 0,
            tasks: [],
            workItems: [],
            settings: {
                theme: "system",
                density: "comfortable",
                defaultView: "today",
                sortMode: "manual"
            },
            legacyImportDismissed: false
        })
    }

    function encodeState(value) {
        return Qt.btoa(encodeURIComponent(String(value)))
    }

    function decodeState(value) {
        var stored = String(value || "")
        if (!stored) {
            return defaultStateJson()
        }

        if (stored.indexOf("file:") !== -1) {
            var legacyValue = stored.replace(/file:/g, "")
            try {
                var decodedLegacyValue = decodeURIComponent(legacyValue)
                if (decodedLegacyValue.charAt(0) === "{") {
                    return decodedLegacyValue
                }
            } catch (legacyError) {
                console.warn("TodoWorklog: 旧持久化数据解码失败", legacyError)
            }
            stored = legacyValue
        }

        try {
            return decodeURIComponent(Qt.atob(stored))
        } catch (encodedError) {
            try {
                return decodeURIComponent(stored)
            } catch (uriError) {
                return stored
            }
        }
    }

    function validatedStateJson(value) {
        try {
            var parsed = JSON.parse(value)
            if (!parsed || typeof parsed !== "object") {
                return defaultStateJson()
            }
            if (typeof parsed.revision !== "number") {
                parsed.revision = 0
            }
            parsed.schemaVersion = 2
            return JSON.stringify(parsed)
        } catch (error) {
            console.warn("TodoWorklog: 持久化数据无效，已使用默认状态", error)
            return defaultStateJson()
        }
    }

    function commitState(candidateJson, baseRevision) {
        if (!storageReady) return false
        try {
            var current = JSON.parse(currentStateJson)
            var candidate = JSON.parse(candidateJson)
            var currentRevision = Number(current.revision) || 0
            if (Number(baseRevision) !== currentRevision) {
                return false
            }

            candidate.schemaVersion = 2
            candidate.revision = currentRevision + 1
            currentStateJson = JSON.stringify(candidate)
            return true
        } catch (error) {
            console.warn("TodoWorklog: 提交状态失败", error)
            return false
        }
    }

    function openCalendarWindow() {
        try {
            if (!calendarWindow) {
                calendarWindow = calendarWindowComponent.createObject(null, {
                    hostBridge: todoHost,
                    pageUrl: root.assetUrl("work-calendar.html"),
                    webProfile: widgetProfile,
                    themeColor: root.styleThemeColor.toString()
                })
            }

            if (!calendarWindow) {
                return false
            }

            calendarWindow.show()
            calendarWindow.raise()
            calendarWindow.requestActivate()
            return true
        } catch (error) {
            console.warn("TodoWorklog: 无法打开月历窗口", error)
            return false
        }
    }

    function closeCalendarWindow() {
        if (calendarWindow) {
            calendarWindow.hide()
        }
        return true
    }

    onCurrentStateJsonChanged: {
        if (storageReady) {
            stateJson = encodeState(currentStateJson)
            todoHost.stateChanged(currentStateJson)
        }
    }

    onStyleThemeColorChanged: {
        var color = styleThemeColor.toString()
        todoHost.themeChanged(color)
        if (calendarWindow) {
            calendarWindow.themeColor = color
        }
    }

    onPersistentPropertyLoaded: function(name, value) {
        if (name !== "stateJson") {
            return
        }

        currentStateJson = validatedStateJson(decodeState(value))
        stateJson = encodeState(currentStateJson)
        storageReady = true
        readyFallback.stop()
        todoHost.readyChanged(true)
        todoHost.stateChanged(currentStateJson)
    }

    Component.onCompleted: {
        registerPersistentProperty("stateJson", encodeState(defaultStateJson()))
        readyFallback.start()
    }

    Component.onDestruction: {
        if (calendarWindow) {
            calendarWindow.destroy()
            calendarWindow = null
        }
    }

    Item {
        id: hostLayer
        anchors.fill: parent

        property var pendingFileRequest: null
        property var pendingDownload: null
        property string savedPath: ""
        property var exportPayload: null
        property bool exportApproved: false

        function prepareExport(filename, text, mimeType) {
            if (exportPayload || pendingDownload) {
                notifyFile("请先完成当前导出")
                return false
            }
            exportPayload = [filename, text, mimeType]
            exportApproved = false
            exportDialog.nameFilters = filename.toLowerCase().endsWith(".txt") ? ["文本文件 (*.txt)"] : filename.toLowerCase().endsWith(".csv") ? ["CSV 文件 (*.csv)"] : ["JSON 备份 (*.json)"]
            exportDialog.selectedFile = String(StandardPaths.writableLocation(StandardPaths.DocumentsLocation)) + "/" + encodeURIComponent(filename)
            exportDialog.open()
            return true
        }

        function localPath(url) {
            return decodeURIComponent(String(url).replace(/^file:\/\/\//, "").replace(/^file:\/\//, "//"))
        }

        function notifyFile(message) {
            var script = "window.dispatchEvent(new CustomEvent('host-file-result',{detail:" + JSON.stringify(message) + "}))"
            mainWebView.runJavaScript(script)
            if (root.calendarWindow) root.calendarWindow.pageView.runJavaScript(script)
        }

        function chooseImport(request) {
            request.accepted = true
            if (pendingFileRequest) pendingFileRequest.dialogReject()
            pendingFileRequest = request
            importDialog.open()
        }

        FileDialog {
            id: importDialog
            title: "选择 JSON 备份"
            fileMode: FileDialog.OpenFile
            nameFilters: ["JSON 备份 (*.json)", "所有文件 (*)"]
            onAccepted: {
                if (hostLayer.pendingFileRequest) hostLayer.pendingFileRequest.dialogAccept([hostLayer.localPath(selectedFile)])
                hostLayer.pendingFileRequest = null
            }
            onRejected: {
                if (hostLayer.pendingFileRequest) hostLayer.pendingFileRequest.dialogReject()
                hostLayer.pendingFileRequest = null
            }
        }

        FileDialog {
            id: exportDialog
            title: "选择导出位置"
            fileMode: FileDialog.SaveFile
            onAccepted: {
                var path = hostLayer.localPath(selectedFile)
                if (!hostLayer.exportPayload) return
                hostLayer.savedPath = path
                hostLayer.exportApproved = true
                mainWebView.runJavaScript("window.TodoPro.downloadPreparedText.apply(null," + JSON.stringify(hostLayer.exportPayload) + ")")
            }
            onRejected: {
                if (hostLayer.pendingDownload) hostLayer.pendingDownload.cancel()
                hostLayer.pendingDownload = null
                hostLayer.exportPayload = null
                hostLayer.exportApproved = false
                hostLayer.notifyFile("已取消导出")
            }
        }

        WebEngineProfile {
            id: widgetProfile
            offTheRecord: true
            onDownloadRequested: function(download) {
                if (hostLayer.pendingDownload || !hostLayer.exportApproved) {
                    download.cancel()
                    hostLayer.notifyFile("请先完成当前导出")
                    return
                }
                hostLayer.pendingDownload = download
                hostLayer.exportApproved = false
                var path = hostLayer.savedPath
                download.downloadDirectory = path.slice(0, path.lastIndexOf("/"))
                download.downloadFileName = path.slice(path.lastIndexOf("/") + 1)
                download.accept()
            }
        }

        Connections {
            target: hostLayer.pendingDownload
            function onIsFinishedChanged() {
                var download = hostLayer.pendingDownload
                if (!download || !download.isFinished) return
                hostLayer.notifyFile(download.state === WebEngineDownloadRequest.DownloadCompleted ? "已保存至：" + hostLayer.savedPath : "导出未完成：" + download.interruptReasonString)
                hostLayer.pendingDownload = null
                hostLayer.exportPayload = null
            }
        }

        QtObject {
            id: todoHost
            objectName: "TodoWorklogHost"

            function prepareExport(filename, text, mimeType) {
                return hostLayer.prepareExport(filename, text, mimeType)
            }

            signal stateChanged(string json)
            signal themeChanged(string color)
            signal readyChanged(bool ready)

            function getState() {
                return root.currentStateJson
            }

            function getThemeColor() {
                return root.styleThemeColor.toString()
            }

            function isReady() {
                return root.storageReady
            }

            function commitState(json, baseRevision) {
                return root.commitState(json, baseRevision)
            }

            function openCalendar() {
                return root.openCalendarWindow()
            }

            function closeCalendar() {
                return root.closeCalendarWindow()
            }
        }

        Timer {
            id: readyFallback
            interval: 800
            repeat: false
            onTriggered: {
                if (!root.storageReady) {
                    root.currentStateJson = root.validatedStateJson(root.decodeState(root.stateJson))
                    var restoredState = JSON.parse(root.currentStateJson)
                    console.log("TodoWorklog: storage restored revision", restoredState.revision, "tasks", (restoredState.tasks || []).length)
                    root.storageReady = true
                    root.stateJson = root.encodeState(root.currentStateJson)
                    todoHost.readyChanged(true)
                    todoHost.stateChanged(root.currentStateJson)
                }
            }
        }

        WebEngineView {
            id: mainWebView
            zoomFactor: 1.5
            anchors.fill: parent
            backgroundColor: "transparent"
            enabled: root.currentOperationMode !== "edit"
            profile: widgetProfile
            url: root.assetUrl("todo.html")
            webChannel: mainWebChannel
            onFileDialogRequested: function(request) { hostLayer.chooseImport(request) }

            Component.onCompleted: {
                console.log("TodoWorklog: 主页面地址", mainWebView.url)
            }

            onContextMenuRequested: function(request) {
                request.accepted = true
            }
        }

        WebChannel {
            id: mainWebChannel
            Component.onCompleted: {
                mainWebChannel.registerObject("todoHost", todoHost)
            }
        }

        Component {
            id: calendarWindowComponent

            Window {
                id: calendarWindowRoot

                property var hostBridge: null
                property url pageUrl: ""
                property var webProfile: null
                property string themeColor: "#3b82f6"
                property alias pageView: calendarWebView

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
                        width = Math.max(1080, Math.round(screen.width * 0.74))
                        height = Math.max(780, Math.round(screen.height * 0.78))
                        x = Math.max(screen.virtualX, screen.virtualX + (screen.width - width) / 2)
                        y = Math.max(screen.virtualY, screen.virtualY + (screen.height - height) / 2)
                    }
                }

                onClosing: function(close) {
                    close.accepted = false
                    calendarWindowRoot.hide()
                }

                WebEngineView {
                    id: calendarWebView
                    anchors.fill: parent
                    zoomFactor: 1.5
                    backgroundColor: "transparent"
                    profile: calendarWindowRoot.webProfile
                    url: calendarWindowRoot.pageUrl
                    webChannel: calendarWebChannel
                    onFileDialogRequested: function(request) { hostLayer.chooseImport(request) }

                    onContextMenuRequested: function(request) {
                        request.accepted = true
                    }
                }

                WebChannel {
                    id: calendarWebChannel
                    Component.onCompleted: {
                        if (calendarWindowRoot.hostBridge) {
                            calendarWebChannel.registerObject("todoHost", calendarWindowRoot.hostBridge)
                        }
                    }
                }
            }
        }
    }
}
