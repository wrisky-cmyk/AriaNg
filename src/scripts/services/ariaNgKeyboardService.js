(function () {
    'use strict';

    angular.module('ariaNg').factory('ariaNgKeyboardService', ['$window', function ($window) {
        var platform = '';

        if ($window.navigator && $window.navigator.userAgentData && $window.navigator.userAgentData.platform) {
            platform = $window.navigator.userAgentData.platform;
        } else if ($window.navigator && $window.navigator.platform) {
            platform = $window.navigator.platform;
        }

        var isMacLike = /(Mac|iPhone|iPod|iPad)/i.test(platform);

        var isModifierKeyPressed = function (event) {
            if (isMacLike) {
                return event.metaKey;
            } else {
                return event.ctrlKey;
            }
        };

        var getKeyCode = function (event) {
            return event.keyCode || event.which || event.charCode;
        };

        var isKeyPressed = function (event, code, keyCode, shiftKey) {
            if (event.isComposing || getKeyCode(event) === 229) { // input method is composing
                return false;
            }

            if (event.ctrlKey || event.metaKey || event.altKey || !!event.shiftKey !== !!shiftKey) {
                return false;
            }

            return event.code === code || getKeyCode(event) === keyCode;
        };

        return {
            isMacKeyboardLike: function () {
                return isMacLike;
            },
            isCtrlAPressed: function (event) {
                return (isModifierKeyPressed(event) && (event.code === 'KeyA' || getKeyCode(event) === 65)); // Ctrl+A / Command+A
            },
            isCtrlFPressed: function (event) {
                return (isModifierKeyPressed(event) && (event.code === 'KeyF' || getKeyCode(event) === 70)); // Ctrl+F / Command+F
            },
            isCtrlEnterPressed: function (event) {
                return (isModifierKeyPressed(event) && (event.code === 'Enter' || getKeyCode(event) === 13)); // Ctrl+Enter / Command+Return
            },
            isBackspacePressed: function (event) {
                return (event.code === 'Backspace' || getKeyCode(event) === 8); // Backspace
            },
            isDeletePressed: function (event) {
                return (event.code === 'Delete' || getKeyCode(event) === 46); // Delete
            },
            isPauseResumePressed: function (event) {
                return isKeyPressed(event, 'KeyP', 80, false); // P
            },
            isNewTaskFromClipboardPressed: function (event) {
                return isKeyPressed(event, 'KeyD', 68, false); // D
            },
            isNewTaskAndStartPressed: function (event) {
                return isKeyPressed(event, 'KeyD', 68, true); // Shift+D
            }
        };
    }]);
}());
