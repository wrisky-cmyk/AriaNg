(function () {
    'use strict';

    angular.module('ariaNg').controller('MainController', ['$rootScope', '$scope', '$route', '$window', '$location', '$document', '$interval', '$timeout', 'clipboard', 'aria2RpcErrors', 'ariaNgCommonService', 'ariaNgVersionService', 'ariaNgNotificationService', 'ariaNgSettingService', 'ariaNgMonitorService', 'ariaNgTitleService', 'aria2TaskService', 'aria2SettingService', function ($rootScope, $scope, $route, $window, $location, $document, $interval, $timeout, clipboard, aria2RpcErrors, ariaNgCommonService, ariaNgVersionService, ariaNgNotificationService, ariaNgSettingService, ariaNgMonitorService, ariaNgTitleService, aria2TaskService, aria2SettingService) {
        var pageTitleRefreshPromise = null;
        var globalStatRefreshPromise = null;

        var getTaskListPageType = function () {
            var location = $location.path().substring(1);

            if (location === 'downloading' || location === 'waiting' || location === 'stopped') {
                return location;
            } else {
                return '';
            }
        };

        var refreshPageTitle = function () {
            var title = ariaNgTitleService.getFinalTitleByGlobalStat({
                globalStat: $scope.globalStat,
                currentRpcProfile: getCurrentRPCProfile()
            });

            $document[0].title = title;
        };

        var refreshGlobalStat = function (silent, callback) {
            return aria2SettingService.getGlobalStat(function (response) {
                if (!response.success && response.data.message === aria2RpcErrors.Unauthorized.message) {
                    $interval.cancel(globalStatRefreshPromise);
                    return;
                }

                if (response.success) {
                    $scope.globalStat = response.data;
                    ariaNgMonitorService.recordGlobalStat(response.data);
                }

                if (callback) {
                    callback(response);
                }
            }, silent);
        };

        var getCurrentRPCProfile = function () {
            if (!$scope.rpcSettings || $scope.rpcSettings.length < 1) {
                return null;
            }

            for (var i = 0; i < $scope.rpcSettings.length; i++) {
                var rpcSetting = $scope.rpcSettings[i];
                if (rpcSetting.isDefault) {
                    return rpcSetting;
                }
            }

            return null;
        };

        if (ariaNgSettingService.getBrowserNotification()) {
            ariaNgNotificationService.requestBrowserPermission();
        }

        $scope.ariaNgVersion = ariaNgVersionService.getBuildVersion();

        $scope.globalStatusContext = {
            isEnabled: ariaNgSettingService.getGlobalStatRefreshInterval() > 0,
            data: ariaNgMonitorService.getGlobalStatsData()
        };

        $scope.enableDebugMode = function () {
            return ariaNgSettingService.isEnableDebugMode();
        };

        $scope.quickSettingContext = null;

        $scope.rpcSettings = ariaNgSettingService.getAllRpcSettings();
        $scope.currentRpcProfile = getCurrentRPCProfile();
        $scope.isCurrentRpcUseWebSocket = ariaNgSettingService.isCurrentRpcUseWebSocket();

        $scope.isTaskSelected = function () {
            return $rootScope.taskContext.getSelectedTaskIds().length > 0;
        };

        $scope.isSelectedTasksAllHaveUrl = function () {
            var selectedTasks = $rootScope.taskContext.getSelectedTasks();

            if (selectedTasks.length < 1) {
                return false;
            }

            for (var i = 0; i < selectedTasks.length; i++) {
                if (!selectedTasks[i].singleUrl) {
                    return false;
                }
            }

            return true;
        };

        $scope.isSelectedTasksAllHaveInfoHash = function () {
            var selectedTasks = $rootScope.taskContext.getSelectedTasks();

            if (selectedTasks.length < 1) {
                return false;
            }

            for (var i = 0; i < selectedTasks.length; i++) {
                if (!selectedTasks[i].bittorrent || !selectedTasks[i].infoHash) {
                    return false;
                }
            }

            return true;
        };

        $scope.isSpecifiedTaskSelected = function () {
            var selectedTasks = $rootScope.taskContext.getSelectedTasks();

            if (selectedTasks.length < 1) {
                return false;
            }

            for (var i = 0; i < selectedTasks.length; i++) {
                for (var j = 0; j < arguments.length; j++) {
                    if (selectedTasks[i].status === arguments[j]) {
                        return true;
                    }
                }
            }

            return false;
        };

        $scope.isSpecifiedTaskShowing = function () {
            var tasks = $rootScope.taskContext.list;

            if (tasks.length < 1) {
                return false;
            }

            for (var i = 0; i < tasks.length; i++) {
                for (var j = 0; j < arguments.length; j++) {
                    if (tasks[i].status === arguments[j]) {
                        return true;
                    }
                }
            }

            return false;
        };

        $scope.changeTasksState = function (state) {
            var gids = $rootScope.taskContext.getSelectedTaskIds();

            if (!gids || gids.length < 1) {
                return;
            }

            var invoke = null;

            if (state === 'start') {
                invoke = aria2TaskService.startTasks;
            } else if (state === 'pause') {
                invoke = aria2TaskService.pauseTasks;
            } else {
                return;
            }

            $rootScope.loadPromise = invoke(gids, function (response) {
                if (response.hasError && gids.length > 1) {
                    ariaNgCommonService.showError('Failed to change some tasks state.');
                }

                if (!response.hasSuccess) {
                    return;
                }

                refreshGlobalStat(true);

                if (!response.hasError && state === 'start') {
                    if ($location.path() === '/waiting') {
                        $location.path('/downloading');
                    } else {
                        $route.reload();
                    }
                } else if (!response.hasError && state === 'pause') {
                    if ($location.path() === '/downloading') {
                        $location.path('/waiting');
                    } else {
                        $route.reload();
                    }
                }
            }, (gids.length > 1));
        };

        $scope.retryTask = function (task) {
            ariaNgCommonService.confirm('Confirm Retry', 'Are you sure you want to retry the selected task? AriaNg will create same task after clicking OK.', 'info', function () {
                $rootScope.loadPromise = aria2TaskService.retryTask(task.gid, function (response) {
                    if (!response.success) {
                        ariaNgCommonService.showError('Failed to retry this task.');
                        return;
                    }

                    refreshGlobalStat(true);

                    var actionAfterRetryingTask = ariaNgSettingService.getAfterRetryingTask();

                    if (response.success && response.data) {
                        if (actionAfterRetryingTask === 'task-list-downloading') {
                            if ($location.path() !== '/downloading') {
                                $location.path('/downloading');
                            } else {
                                $route.reload();
                            }
                        } else if (actionAfterRetryingTask === 'task-detail') {
                            $location.path('/task/detail/' + response.data);
                        } else {
                            $route.reload();
                        }
                    }
                }, false);
            });
        };

        $scope.hasRetryableTask = function () {
            return $rootScope.taskContext.hasRetryableTask();
        };

        $scope.hasCompletedTask = function () {
            return $rootScope.taskContext.hasCompletedTask();
        };

        $scope.isSelectedTaskRetryable = function () {
            var selectedTasks = $rootScope.taskContext.getSelectedTasks();

            if (selectedTasks.length < 1) {
                return false;
            }

            for (var i = 0; i < selectedTasks.length; i++) {
                if (!$rootScope.isTaskRetryable(selectedTasks[i])) {
                    return false;
                }
            }

            return true;
        };

        $scope.retryTasks = function () {
            var tasks = $rootScope.taskContext.getSelectedTasks();

            if (!tasks || tasks.length < 1) {
                return;
            } else if (tasks.length === 1) {
                return $scope.retryTask(tasks[0]);
            }

            var retryableTasks = [];
            var skipCount = 0;

            for (var i = 0; i < tasks.length; i++) {
                if ($rootScope.isTaskRetryable(tasks[i])) {
                    retryableTasks.push(tasks[i]);
                } else {
                    skipCount++;
                }
            }

            ariaNgCommonService.confirm('Confirm Retry', 'Are you sure you want to retry the selected task? AriaNg will create same task after clicking OK.', 'info', function () {
                $rootScope.loadPromise = aria2TaskService.retryTasks(retryableTasks, function (response) {
                    refreshGlobalStat(true);

                    ariaNgCommonService.showInfo('Operation Result', '{successCount} tasks have been retried and {failedCount} tasks are failed.', function () {
                        var actionAfterRetryingTask = ariaNgSettingService.getAfterRetryingTask();

                        if (response.hasSuccess) {
                            if (actionAfterRetryingTask === 'task-list-downloading') {
                                if ($location.path() !== '/downloading') {
                                    $location.path('/downloading');
                                } else {
                                    $route.reload();
                                }
                            } else {
                                $route.reload();
                            }
                        }
                    }, {
                        textParams: {
                            successCount: response.successCount,
                            failedCount: response.failedCount,
                            skipCount: skipCount
                        }
                    });
                }, false);
            }, true);
        };

        $scope.removeTasks = function () {
            var tasks = $rootScope.taskContext.getSelectedTasks();

            if (!tasks || tasks.length < 1) {
                return;
            }

            var removeTasks = function () {
                $rootScope.loadPromise = aria2TaskService.removeTasks(tasks, function (response) {
                    if (response.hasError && tasks.length > 1) {
                        ariaNgCommonService.showError('Failed to remove some task(s).');
                    }

                    if (!response.hasSuccess) {
                        return;
                    }

                    refreshGlobalStat(true);

                    if (!response.hasError) {
                        if ($location.path() !== '/stopped') {
                            $location.path('/stopped');
                        } else {
                            $route.reload();
                        }
                    }
                }, (tasks.length > 1));
            };

            if (ariaNgSettingService.getConfirmTaskRemoval()) {
                ariaNgCommonService.confirm('Confirm Remove', 'Are you sure you want to remove the selected task?', 'warning', removeTasks);
            } else {
                removeTasks();
            };
        };

        $scope.clearStoppedTasks = function () {
            ariaNgCommonService.confirm('Confirm Clear', 'Are you sure you want to clear stopped tasks?', 'warning', function () {
                $rootScope.loadPromise = aria2TaskService.clearStoppedTasks(function (response) {
                    if (!response.success) {
                        return;
                    }

                    refreshGlobalStat(true);

                    if ($location.path() !== '/stopped') {
                        $location.path('/stopped');
                    } else {
                        $route.reload();
                    }
                });
            });
        };

        $scope.isAllTasksSelected = function () {
            return $rootScope.taskContext.isAllSelected();
        };

        $scope.selectAllTasks = function () {
            $rootScope.taskContext.selectAll();
        };

        $scope.selectAllFailedTasks = function () {
            $rootScope.taskContext.selectAllFailed();
        };

        $scope.selectAllCompletedTasks = function () {
            $rootScope.taskContext.selectAllCompleted();
        };

        $scope.copySelectedTasksDownloadLink = function () {
            var selectedTasks = $rootScope.taskContext.getSelectedTasks();
            var result = '';

            for (var i = 0; i < selectedTasks.length; i++) {
                if (i > 0) {
                    result += '\n';
                }

                result += selectedTasks[i].singleUrl;
            }

            if (result.length > 0) {
                clipboard.copyText(result);
            }
        };

        $scope.copySelectedTasksMagnetLink = function () {
            var selectedTasks = $rootScope.taskContext.getSelectedTasks();
            var result = '';

            for (var i = 0; i < selectedTasks.length; i++) {
                if (i > 0) {
                    result += '\n';
                }

                result += 'magnet:?xt=urn:btih:' + selectedTasks[i].infoHash;
            }

            if (result.length > 0) {
                clipboard.copyText(result);
            }
        };

        $scope.changeDisplayOrder = function (type, autoSetReverse) {
            var taskListPageType = getTaskListPageType();
            var oldType = ariaNgCommonService.parseOrderType(ariaNgSettingService.getDisplayOrder(taskListPageType));
            var newType = ariaNgCommonService.parseOrderType(type);

            if (autoSetReverse && newType.type === oldType.type) {
                newType.reverse = !oldType.reverse;
            }

            ariaNgSettingService.setDisplayOrder(newType.getValue(), taskListPageType);
        };

        $scope.isSetDisplayOrder = function (type) {
            var taskListPageType = getTaskListPageType();
            var orderType = ariaNgCommonService.parseOrderType(ariaNgSettingService.getDisplayOrder(taskListPageType));
            var targetType = ariaNgCommonService.parseOrderType(type);

            return orderType.equals(targetType);
        };

        $scope.showQuickSettingDialog = function (type, title) {
            $scope.quickSettingContext = {
                type: type,
                title: title
            };
        };

        $scope.switchRpcSetting = function (setting) {
            if (setting.isDefault) {
                return;
            }

            ariaNgSettingService.setDefaultRpcSetting(setting);

            if ($location.path().indexOf('/task/detail/') === 0) {
                $rootScope.setAutoRefreshAfterPageLoad();
                $location.path('/downloading');
            } else {
                $window.location.reload();
            }
        };

        var escapeHtml = function (text) {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        var cleanUrlToken = function (token) {
            var cleaned = String(token).replace(/^[<"'\u300c\u300e\uff08(\u3010\u300a,;:\u3001\uff0c]+/, '');
            var keepBrackets = /[(\uff08\u3010\u300a]/.test(cleaned);
            var trailing = keepBrackets ? /[>"'\u300d\u300f,;:.\u3001\uff0c]+$/ : /[>"'\u300d\u300f\uff09)\u3011\u300b,;:.\u3001\uff0c]+$/;

            return cleaned.replace(trailing, '');
        };

        var parseUrlsFromClipboard = function (text) {
            var urls = [];
            var lines = String(text || '').split(/\r?\n/);

            for (var i = 0; i < lines.length; i++) {
                var tokens = lines[i].trim().split(/\s+/);

                for (var j = 0; j < tokens.length; j++) {
                    var parsedUrls = ariaNgCommonService.parseUrlsFromOriginInput(cleanUrlToken(tokens[j]));

                    for (var k = 0; k < parsedUrls.length; k++) {
                        if (urls.indexOf(parsedUrls[k]) < 0) {
                            urls.push(parsedUrls[k]);
                        }
                    }
                }
            }

            return urls;
        };

        var pauseOrResumeAllTasks = function () {
            aria2SettingService.getGlobalStat(function (response) {
                if (!response.success) {
                    return;
                }

                var isPaused = parseInt(response.data.numActive, 10) > 0;

                if (isPaused) {
                    aria2TaskService.pauseAllTasks(null, true);
                } else {
                    aria2TaskService.unpauseAllTasks(null, true);
                }

                // keep the same behaviour as the pause / start button in the task list toolbar
                if (isPaused && $location.path() === '/downloading') {
                    $location.path('/waiting');
                } else if (!isPaused && $location.path() === '/waiting') {
                    $location.path('/downloading');
                }
            }, true);
        };

        var createTasksFromUrls = function (urls) {
            var tasks = [];

            for (var i = 0; i < urls.length; i++) {
                tasks.push({urls: [urls[i]], options: {}});
            }

            $rootScope.loadPromise = aria2TaskService.newUriTasks(tasks, false, function (response) {
                var content = urls.map(escapeHtml).join('<br/>');

                if (response.hasSuccess) {
                    ariaNgNotificationService.notifyInPage('New Download Task Created', content, {
                        type: response.hasError ? 'warning' : 'success'
                    });
                } else {
                    ariaNgNotificationService.notifyInPage('Failed to Create New Download Task', content, {
                        type: 'error'
                    });
                }
            });
        };

        var newTasksFromClipboard = function (startImmediately) {
            var clipboard = ($window.navigator ? $window.navigator.clipboard : null);
            var cannotReadClipboard = function () {
                ariaNgNotificationService.notifyInPage('Cannot Read Clipboard', 'Please allow this site to read the clipboard, or open the "New" page and paste the link manually.', {
                    type: 'warning'
                });

                $location.path('/new');
            };

            if (!clipboard || !angular.isFunction(clipboard.readText)) {
                cannotReadClipboard();
                return;
            }

            clipboard.readText().then(function (text) {
                var urls = parseUrlsFromClipboard(text);

                if (urls.length < 1) {
                    ariaNgNotificationService.notifyInPage('No Link Found in Clipboard', 'Only http / https / ftp / sftp / magnet links are supported.', {
                        type: 'warning'
                    });
                    return;
                }

                if (startImmediately) {
                    createTasksFromUrls(urls);
                } else {
                    $location.path('/new').search({url: ariaNgCommonService.base64UrlEncode(urls.join('\n'))});
                }
            }, function () {
                cannotReadClipboard();
            });
        };

        $rootScope.keydownActions.pauseResume = function (event) {
            if (event.preventDefault) {
                event.preventDefault();
            }

            var tasks = $rootScope.taskContext.getSelectedTasks();
            var shouldPause = false;

            for (var i = 0; tasks && i < tasks.length; i++) {
                if (tasks[i].status === 'active' || tasks[i].status === 'waiting') {
                    shouldPause = true;
                    break;
                }
            }

            if (tasks && tasks.length > 0) {
                $scope.changeTasksState(shouldPause ? 'pause' : 'start');
            } else {
                pauseOrResumeAllTasks();
            }

            return false;
        };

        $rootScope.keydownActions.newTaskFromClipboard = function (event) {
            if (event.preventDefault) {
                event.preventDefault();
            }

            newTasksFromClipboard(true);

            return false;
        };

        $rootScope.keydownActions.newTaskPageFromClipboard = function (event) {
            if (event.preventDefault) {
                event.preventDefault();
            }

            newTasksFromClipboard(false);

            return false;
        };

        // Local links (127.0.0.1 / localhost / ...) are usually served by a local proxy or a local
        // server. When the speed drops below the threshold, this connection is probably stuck, so
        // pause the task and resume it shortly after to rebuild the connection. Keep doing that
        // until the task reaches targetPercent.
        var localLowSpeedRetrySettings = {
            enabled: true,
            thresholdKBps: 1000,            // retry when the download speed is lower than this (KB/s)
            targetPercent: 95,              // stop retrying after the task reaches this percent
            intervalMilliseconds: 3000,     // how often the running tasks are checked
            slowTimes: 2,                   // slow checks in a row before pausing a task
            resumeDelayMilliseconds: 2000,  // resume the task this long after pausing it
            cooldownMilliseconds: 10000,    // minimum time between two retries of the same task
            maxRetriesWithoutProgress: 6,   // give up after so many retries without progress (0 = never)
            localHostNames: ['127.0.0.1', 'localhost', '::1', '0.0.0.0']
        };

        var localLowSpeedRetryStates = {};
        var localLowSpeedRetryIntervalPromise = null;

        var getUrlHost = function (url) {
            var matchResult = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(String(url || ''));

            if (!matchResult) {
                return '';
            }

            var authority = matchResult[1];
            var atIndex = authority.lastIndexOf('@'); // strip the user info of http://user:pass@host/...

            if (atIndex >= 0) {
                authority = authority.substring(atIndex + 1);
            }

            if (authority.charAt(0) === '[') { // IPv6, e.g. http://[::1]:6800/...
                var endIndex = authority.indexOf(']');

                return endIndex > 0 ? authority.substring(1, endIndex).toLowerCase() : '';
            }

            var colonIndex = authority.indexOf(':');

            if (colonIndex >= 0) {
                authority = authority.substring(0, colonIndex);
            }

            return authority.toLowerCase();
        };

        var isLocalHost = function (host) {
            if (!host) {
                return false;
            }

            if (localLowSpeedRetrySettings.localHostNames.indexOf(host) >= 0) {
                return true;
            }

            return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host); // 127.0.0.0/8
        };

        var isLocalTask = function (task) {
            for (var i = 0; task && task.files && i < task.files.length; i++) {
                var uris = task.files[i].uris || [];

                for (var j = 0; j < uris.length; j++) {
                    if (uris[j] && uris[j].uri && isLocalHost(getUrlHost(uris[j].uri))) {
                        return true;
                    }
                }
            }

            return false;
        };

        var getTaskProgressPercent = function (task) {
            var totalLength = parseInt(task.totalLength, 10) || 0;
            var completedLength = parseInt(task.completedLength, 10) || 0;

            if (totalLength > 0) {
                return completedLength / totalLength * 100;
            }

            return task.status === 'complete' ? 100 : 0;
        };

        var getTaskDownloadSpeed = function (task) {
            return parseInt(task.downloadSpeed, 10) || 0;
        };

        var getRawTaskName = function (task) { // the raw task data has no task name yet
            if (task.bittorrent && task.bittorrent.info && task.bittorrent.info.name) {
                return task.bittorrent.info.name;
            }

            if (task.files && task.files.length > 0 && task.files[0].path) {
                var path = String(task.files[0].path);
                var index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));

                return index >= 0 ? path.substring(index + 1) : path;
            }

            return '';
        };

        var getLocalLowSpeedRetryState = function (gid) {
            if (!localLowSpeedRetryStates[gid]) {
                localLowSpeedRetryStates[gid] = {
                    slowTimes: 0,
                    retryTimes: 0,
                    stuckRetries: 0,
                    lastRetryTime: 0,
                    lastCompletedLength: null,
                    resumeTime: 0,
                    resumePromise: null,
                    gaveUp: false
                };
            }

            return localLowSpeedRetryStates[gid];
        };

        var resumeLocalLowSpeedTask = function (gid, state) {
            if (state.resumePromise) {
                $timeout.cancel(state.resumePromise);
                state.resumePromise = null;
            }

            aria2TaskService.startTasks([gid], null, true);
        };

        var retryLocalLowSpeedTask = function (task, state) {
            var completedLength = parseInt(task.completedLength, 10) || 0;

            if (state.lastCompletedLength !== null && completedLength <= state.lastCompletedLength) {
                state.stuckRetries++;
            } else {
                state.stuckRetries = 0;
            }

            state.lastCompletedLength = completedLength;

            if (localLowSpeedRetrySettings.maxRetriesWithoutProgress > 0 &&
                state.stuckRetries >= localLowSpeedRetrySettings.maxRetriesWithoutProgress) {
                if (!state.gaveUp) {
                    state.gaveUp = true;

                    ariaNgNotificationService.notifyInPage('Stop Retrying Local Link Download',
                        getRawTaskName(task) + ' (' + getTaskProgressPercent(task).toFixed(1) + '%)', {
                            type: 'warning'
                        });
                }

                return;
            }

            state.retryTimes++;
            state.slowTimes = 0;
            state.lastRetryTime = (new Date()).getTime();

            aria2TaskService.pauseTasks([task.gid], null, true);

            state.resumeTime = state.lastRetryTime + localLowSpeedRetrySettings.resumeDelayMilliseconds;
            state.resumePromise = $timeout(function () {
                resumeLocalLowSpeedTask(task.gid, state);
            }, localLowSpeedRetrySettings.resumeDelayMilliseconds);

            if (state.retryTimes === 1) {
                ariaNgNotificationService.notifyInPage('Local Link Download Speed Too Low', getRawTaskName(task), {
                    type: 'info'
                });
            }
        };

        // do not leave a task paused when the resume timer was throttled by the browser
        var flushOverdueLocalLowSpeedResumes = function (currentTime) {
            var gids = Object.keys(localLowSpeedRetryStates);

            for (var i = 0; i < gids.length; i++) {
                var state = localLowSpeedRetryStates[gids[i]];

                if (state.resumePromise && currentTime - state.resumeTime > 30000) {
                    resumeLocalLowSpeedTask(gids[i], state);
                }
            }
        };

        var checkLocalLowSpeedTasks = function () {
            var currentTime = (new Date()).getTime();

            flushOverdueLocalLowSpeedResumes(currentTime);

            if (!localLowSpeedRetrySettings.enabled) {
                return;
            }

            aria2TaskService.getTaskList('downloading', true, function (response) {
                if (!response.success || !response.data) {
                    return;
                }

                var thresholdBytes = localLowSpeedRetrySettings.thresholdKBps * 1024;

                for (var i = 0; i < response.data.length; i++) {
                    var task = response.data[i];

                    if (!task || !task.gid || !isLocalTask(task)) {
                        continue;
                    }

                    if (getTaskProgressPercent(task) >= localLowSpeedRetrySettings.targetPercent) {
                        delete localLowSpeedRetryStates[task.gid];
                        continue;
                    }

                    var state = getLocalLowSpeedRetryState(task.gid);

                    if (state.gaveUp || state.resumePromise) {
                        continue;
                    }

                    if (currentTime - state.lastRetryTime < localLowSpeedRetrySettings.cooldownMilliseconds) {
                        continue;
                    }

                    if (getTaskDownloadSpeed(task) < thresholdBytes) {
                        state.slowTimes++;

                        if (state.slowTimes >= localLowSpeedRetrySettings.slowTimes) {
                            retryLocalLowSpeedTask(task, state);
                        }
                    } else {
                        state.slowTimes = 0;
                    }
                }
            }, true);
        };

        var startLocalLowSpeedRetryMonitor = function () {
            if (!localLowSpeedRetrySettings.enabled) {
                return;
            }

            checkLocalLowSpeedTasks();

            localLowSpeedRetryIntervalPromise = $interval(function () {
                checkLocalLowSpeedTasks();
            }, localLowSpeedRetrySettings.intervalMilliseconds);
        };

        if (ariaNgSettingService.getTitleRefreshInterval() > 0) {
            pageTitleRefreshPromise = $interval(function () {
                refreshPageTitle();
            }, ariaNgSettingService.getTitleRefreshInterval());
        }

        if (ariaNgSettingService.getGlobalStatRefreshInterval() > 0) {
            globalStatRefreshPromise = $interval(function () {
                refreshGlobalStat(true);
            }, ariaNgSettingService.getGlobalStatRefreshInterval());
        }

        $scope.$on('$destroy', function () {
            if (pageTitleRefreshPromise) {
                $interval.cancel(pageTitleRefreshPromise);
            }

            if (globalStatRefreshPromise) {
                $interval.cancel(globalStatRefreshPromise);
            }

            if (localLowSpeedRetryIntervalPromise) {
                $interval.cancel(localLowSpeedRetryIntervalPromise);
            }
        });

        refreshGlobalStat(true, function () {
            refreshPageTitle();
        });

        startLocalLowSpeedRetryMonitor();
    }]);
}());
